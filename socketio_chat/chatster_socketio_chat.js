/*
  Copyright (C) 2017 - 2020 MWSOFT
  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.
  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.
  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
/* jshint esnext: true */
require('events').EventEmitter.prototype._maxListeners = 0;
var config = require('/opt/chatster_backend/chatster_config/chatster_config.js');
var functions = require('/opt/chatster_backend/socketio_chat/functions.js');
var email = require('/opt/chatster_backend/chatster_email/chatster_email.js');
var time = require('/opt/chatster_backend/chatster_time/chatster_time.js');
var fs = require("fs");
var express = require("express");
var https = require('https');
var options = {
    key: fs.readFileSync(config.security.key),
    cert: fs.readFileSync(config.security.cert)
};
var app = express();
var Sequelize = require('sequelize');
var mysql = require('mysql');
var bodyParser = require("body-parser");
var cors = require("cors");
var nodemailer = require('nodemailer');
var dateTime = require('node-datetime');
var moment = require('moment-timezone');
var amqp = require('amqplib/callback_api');
var admin = require('firebase-admin');
var serviceAccount = require(config.firebase.service_account);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.firebase.databaseURL
});
var db = admin.database();
var ref = db.ref();
var offlineMessagesRef = ref.child('offline_messages');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("./public"));
app.use(cors());

app.use(function(req, res, next) {
    next();
});

var server = https.createServer(options, app).listen(config.port.chat_port, function() {
    email.sendNewSocketChatIsUpEmail();
});

var io = require("socket.io")(server, { transports: ['websocket'] });


/**
 *   RabbitMQ connection object
 */
var amqpConn = null;


/**
 *  Map containing all currently connected sockets
 */
var currSockets = new Map();


/**
 *  Publishes message on topic
 */
function publishMessageToToipc(message, userId) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'messageForUser.*';
            var key = 'messageForUser.' + userId;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(message));
        });
    }
}


/**
 *  Publishes user status online/offline on topic
 */
function publishStatusToToipc(status, userId) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'messageForUser.*';
            var key = 'messageForUser.' + userId;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(status));
        });
    }
}


/**
 *  Subscribe user on topic to receive messages
 */
function subscribeToTopic(userId) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'messageForUser.*';
            var toipcName = 'messageForUser.' + userId;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.assertQueue(toipcName, { exclusive: false, auto_delete: true }, function(err, q) {
                ch.bindQueue(q.queue, exchange, toipcName);
                ch.consume(q.queue, function(msg) {
                    var message = JSON.parse(msg.content.toString());
                    if (message.event === 'message') {
                        if (currSockets.has(message.receiverId)) {
                            currSockets.get(message.receiverId).emit(message.event, message);
                        }
                    } else if (message.event === "contactOnline") {
                        if (currSockets.has(message.receiverId)) {
                            currSockets.get(message.receiverId).emit(message.event, message.value);
                        }
                    } else if (message.event === "unbind") {
                        ch.unbindQueue(q.queue, exchange, toipcName);
                        ch.close();
                    } else if (message.event === "unsendMessage") {
                        if (currSockets.has(message.receiverId)) {
                            currSockets.get(message.receiverId).emit(message.event, message);
                        }
                    } else if (message.event === "spyChat") {
                        if (currSockets.has(message.receiverId)) {
                            currSockets.get(message.receiverId).emit(message.event, message);
                        }
                    } else if (message.event === "connectionToSpyChat") {
                        if (currSockets.has(message.receiverId)) {
                            currSockets.get(message.receiverId).emit(message.event, message);
                        }

                        if(message.action === "disconnect" || message.action === "spyIsOffline"){
                            if (currSockets.has(message.senderId)) {
                                currSockets.get(message.senderId).emit(message.event, message);
                            }
                        }
                    }
                }, { noAck: true });
            });
        });
    }
}


/**
 *  Connect to RabbitMQ
 */
function connectToRabbitMQ() {
    amqp.connect(config.rabbitmq.url, function(err, conn) {
        if (err) {
            email.sendChatErrorEmail(err);
            console.error("[AMQP]", err.message);
            return setTimeout(connectToRabbitMQ, 1000);
        }
        conn.on("error", function(err) {
            email.sendChatErrorEmail(err);
            if (err.message !== "Connection closing") {
                console.error("[AMQP] conn error", err.message);
            }
        });
        conn.on("close", function() {
            console.error("[AMQP] reconnecting");
            return setTimeout(connectToRabbitMQ, 1000);
        });
        console.log("[AMQP] connected");
        amqpConn = conn;
    });
}

connectToRabbitMQ();


/**
 *  MySQL Sequelize object
 */
const sequelize = new Sequelize(config.db.name, config.db.user_name, config.db.password, {
    host: config.db.host,
    dialect: config.db.dialect,
    port: config.db.port,
    operatorsAliases: config.db.operatorsAliases,
    pool: {
      max: config.db.pool.max,
      min: config.db.pool.min,
      acquire: config.db.pool.acquire,
      idle: config.db.pool.idle
    }
});


/**
 *  Sends message delivery status response to the user
 */
function respondWithMessageDeliveryStatus(uuid, status, socket) {
    var msgDeliveryStatus = {
        uuid: uuid,
        status: status
    };
    socket.emit('messageDeliveryStatus', msgDeliveryStatus);
}


/**
 *  SOCKET.IO listeners
 */
io.sockets.on("connection", function(socket) {

    /**
     *  on.connectionToSpyChat handles connection to spy chat
     */
    socket.on("connectionToSpyChat", function(senderId, senderName, contactId, action) {
        sequelize.query('CALL CheckIfChatUserOnline(?,?)',
        { replacements: [ socket.chatname, contactId.toString() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                // if result is not null that means the contact is connected to this chat room
                // so, just emit the message to contact but not to the user self
                if(result.length > 0){
                    var msg = {
                        senderId: senderId.toString(),
                        senderName: senderName,
                        receiverId: contactId.toString(),
                        action: action,
                        event: "connectionToSpyChat"
                    };

                    publishMessageToToipc(JSON.stringify(msg), contactId.toString());
                }else{
                    // emit spyChat event notifying that other spy is not connected
                    var msg = {
                        senderId: senderId.toString(),
                        senderName: senderName,
                        receiverId: contactId.toString(),
                        action: "spyIsOffline",
                        event: "connectionToSpyChat"
                    };
                    publishMessageToToipc(JSON.stringify(msg), senderId.toString());
                }
        }).error(function(err){
            email.sendChatErrorEmail(err);
        });
    });

    /**
     *  on.spyChat handles spy messages
     */
    socket.on("spyChat", function(message, senderId, senderName, contactId, chatName, msgType, uuid, contactPublicKeyUUID, userPublicKeyUUID) {
        var myutc = time.getCurrentUTC();
        sequelize.query('CALL CheckIfChatUserOnline(?,?)',
        { replacements: [ socket.chatname, contactId.toString() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                // if result is not null that means the contact is connected to this chat room
                // so, just emit the message to contact but not to the user self
                if(result.length > 0){
                    var msg = {
                        msgType: msgType,
                        senderId: senderId.toString(),
                        senderName: senderName,
                        chatname: socket.chatname,
                        messageText: message,
                        receiverId: contactId.toString(),
                        uuid: uuid,
                        contactPublicKeyUUID: contactPublicKeyUUID,
                        messageCreated: myutc,
                        event: "spyChat"
                    };

                    publishMessageToToipc(JSON.stringify(msg), contactId.toString());
                }else{
                    // emit spyChat event notifying that other spy has left
                    var msg = {
                        senderId: senderId.toString(),
                        senderName: senderName,
                        receiverId: contactId.toString(),
                        action: "spyIsOffline",
                        event: "connectionToSpyChat"
                    };
                    publishMessageToToipc(JSON.stringify(msg), senderId.toString());
                }
        }).error(function(err){
            email.sendChatErrorEmail(err);
        });
    });


    /**
     *  on.chat handles messages
     */
    socket.on("chat", function(message, senderId, senderName, contactId, chatName, msgType, uuid, contactPublicKeyUUID, userPublicKeyUUID) {
        var myutc = time.getCurrentUTC();
        sequelize.query('CALL CheckIfChatUserOnline(?,?)',
        { replacements: [ socket.chatname, contactId.toString() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                    // if result is not null that means the contact is connected to this chat room
                    // so, just emit the message to contact but not to the user self
                    if(result.length > 0){
                        var msg = {
                            msgType: msgType,
                            senderId: senderId.toString(),
                            senderName: senderName,
                            chatname: socket.chatname,
                            messageText: message,
                            receiverId: contactId.toString(),
                            uuid: uuid,
                            contactPublicKeyUUID: contactPublicKeyUUID,
                            messageCreated: myutc,
                            event: "message"
                        };
                        // save this message temporary until receiver sends aknowldgement then delete
                        sequelize.query('CALL InsertNewReceivedOnlineMessage(?,?,?,?,?,?,?,?,?,?)',
                        { replacements: [ "chatMsg", msgType, senderId.toString(), contactId.toString(), socket.chatname, message, uuid, contactPublicKeyUUID, "message", myutc ],
                            type: sequelize.QueryTypes.RAW }).then(result => {
                                publishMessageToToipc(JSON.stringify(msg), contactId.toString());
                                respondWithMessageDeliveryStatus(uuid, "success", socket);
                                sequelize.query('CALL DeleteOneTimePublicKeysByUUID(?,?)',
                                { replacements: [ contactPublicKeyUUID, userPublicKeyUUID ], 
                                    type: sequelize.QueryTypes.RAW }).then(result => {
                                }).error(function(err){
                                    email.sendChatErrorEmail(err);
                                });
                        }).error(function(err){
                            email.sendChatErrorEmail(err);
                            respondWithMessageDeliveryStatus(uuid, "error", socket);
                        });
                    }else{
                        // if result is null that means contact is not connected to this chat room
                        // save the message so that contct can retrieve it later when notification is received
                        sequelize.query('CALL InsertNewOfflineMessage(?,?,?,?,?,?,?,?,?)',
                        { replacements: [ "chatMsg", msgType, senderId.toString(), contactId.toString(), socket.chatname, message, uuid, contactPublicKeyUUID, myutc ],
                            type: sequelize.QueryTypes.RAW }).then(result => {
                                var firebaseOfflineMessage = {
                                    receiver_id: contactId.toString()
                                };
                                offlineMessagesRef.child(uuid).set(firebaseOfflineMessage);
                                respondWithMessageDeliveryStatus(uuid, "success", socket);
                                sequelize.query('CALL DeleteOneTimePublicKeysByUUID(?,?)',
                                { replacements: [ contactPublicKeyUUID, userPublicKeyUUID ],
                                    type: sequelize.QueryTypes.RAW }).then(result => {
                                }).error(function(err){
                                    email.sendChatErrorEmail(err);
                                });
                        }).error(function(err){
                            email.sendChatErrorEmail(err);
                            respondWithMessageDeliveryStatus(uuid, "error", socket);
                        });
                    }
        }).error(function(err){
            email.sendChatErrorEmail(err);
            respondWithMessageDeliveryStatus(uuid, "error", socket);
        });
    });

    /**
     *  on.openchat sets up 1:1 chat room connection
     */
    socket.on("openchat", function(userId, contactId, chatname) {
        // id of the user who is going to be sending messages to the contact with id of contactId
        socket.userId = userId.toString();
        // id of the contact who is going to be receiving messages from user with id of userId
        socket.contactId = contactId.toString();
        if (currSockets.has(socket.userId)) {
            currSockets.delete(socket.userId);
            currSockets.set(socket.userId, socket);
        } else {
            currSockets.set(socket.userId, socket);
        }
        subscribeToTopic(socket.userId);
        // check if contact is connected to chatname/reverse chatname
        // and just join this user to it
        var firstpartchatname = chatname.split("@")[0];
        var secondpartchatname = chatname.split("@")[1];
        var reversechatname = secondpartchatname.concat("@").concat(firstpartchatname);
        socket.username = firstpartchatname;
        sequelize.query('CALL CheckIfUserConnectedToChat(?,?)',
        { replacements: [ chatname, reversechatname ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                if(result.length > 0){
                    // if result is not null that means the contact is connected to this chat room
                    // emit contact is online event and join the user to this chat room as well
                    socket.chatname = result[0].chat_name;
                    socket.join(socket.chatname);
                    // let the user know that the contact is online
                    var status = {
                        value: "Online",
                        event: "contactOnline",
                        senderId: socket.userId,
                        receiverId: socket.contactId,
                        chatname: socket.chatname
                    };
                    publishStatusToToipc(JSON.stringify(status), socket.contactId);
                    socket.emit("contactOnline", "Online");
                }else{
                    // if result is null that means contact is not connected to this chat room
                    // connect the user to this chat room and save record to db so that contact knows that this user is online
                    socket.chatname = chatname;
                    socket.join(socket.chatname);  
                }
                sequelize.query('CALL InsertNewOnlineUser(?,?,?)',
                { replacements: [ socket.chatname, userId.toString(), time.getCurrentUTC() ],
                    type: sequelize.QueryTypes.RAW }).then(result => {
                }).error(function(err){
                    email.sendChatErrorEmail(err);
                });
        }).error(function(err){
            email.sendChatErrorEmail(err);          
        });
    });


    /**
     *  on.unsendMessage handles un-sending of messages
     */
    socket.on("unsendMessage", function(senderId, senderName, contactId, chatName, uuid) {
        var myutc = time.getCurrentUTC();
        sequelize.query('CALL CheckIfUserIsAllowedToUnsend(?,?)',
        { replacements: [ senderId.toString(), contactId.toString() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                if(result[0].contact_is_allowed_to_unsend === 1){
                    sequelize.query('CALL CheckIfChatUserOnline(?,?)',
                    { replacements: [ chatName, contactId.toString() ],
                        type: sequelize.QueryTypes.RAW }).then(result => {
                                // if result is not null that means the contact is connected to this chat room
                                // so, just emit the message to contact but not to this user
                                if(result.length > 0){
                                    var msg = {
                                        msgType: "unsendMessage",
                                        senderId: senderId.toString(),
                                        receiverId: contactId.toString(),
                                        chatname: socket.chatname,
                                        messageText: "unsendMessage",
                                        uuid: uuid,
                                        event: "unsendMessage"
                                    };
                                    publishMessageToToipc(JSON.stringify(msg), contactId.toString());
                                }else{
                                    // if result is null that means contact is not connected to this chat room
                                    // save the message so that contact can retrieve it later 
                                    sequelize.query('CALL InsertNewOfflineMessage(?,?,?,?,?,?,?,?,?)',
                                    { replacements: [ "unsendMessage", "unsendMessage", senderId.toString(), contactId.toString(), socket.chatname, "unsendMessage", uuid, "unsendMessage", myutc ],
                                        type: sequelize.QueryTypes.RAW }).then(result => {
                                            var firebaseOfflineMessage = {
                                                receiver_id: "" + contactId.toString()
                                            };
                                            offlineMessagesRef.child(uuid).set(firebaseOfflineMessage);
                                    }).error(function(err){
                                        email.sendChatErrorEmail(err);
                                    });
                                }
                    }).error(function(err){
                        email.sendChatErrorEmail(err);
                    });
                }else{
                    // if result is null that means the sender is not allowed to unsend in this chat room
                    var msg = {
                        msgType: "unsendMessage",
                        senderId: senderId,
                        chatname: socket.chatname,
                        messageText: "notAllowedToUnsend",
                        uuid: uuid
                    };
                    socket.emit('unsendMessage', msg); 
                }
        }).error(function(err){
            email.sendChatErrorEmail(err);
        });
    });


    /**
     * on.messageReceived handles message received confirmation by the client
     */
    socket.on("messageReceived", function(uuid) {
        var messageReceivedResponseError = {
            status: "error",
            uuid: uuid
        };
        var messageReceivedResponseSuccess = {
            status: "success",
            uuid: uuid
        };
        // the message receiver has acknowledged the reception of the message and it can now be deleted
        sequelize.query('CALL DeleteReceivedOnlineMessage(?)',
        { replacements: [ uuid ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                socket.emit('messageReceived', messageReceivedResponseSuccess);
        }).error(function(err){
            email.sendChatErrorEmail(err);
            socket.emit('messageReceived', messageReceivedResponseError);
        });
    });


    /**
     *  on.disconnect handles leaving 1:1 chat room
     */
    socket.on("disconnect", function() {
        // unbind your own queue as you are leaving and you won't be consuming messages anymore
        var unbindMyQueue = {
            value: "Unbind My Queue",
            event: "unbind",
            senderId: socket.userId,
            receiverId: socket.userId
        };
        publishStatusToToipc(JSON.stringify(unbindMyQueue), socket.userId);
        // delete your record from db so that your contact knows you left
        sequelize.query('CALL DeleteOnlineUser(?,?)',
        { replacements: [ socket.chatname, socket.userId ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                // let other user know that you left the room
                var status = {
                    value: "Offline",
                    event: "contactOnline",
                    senderId: socket.userId,
                    receiverId: socket.contactId,
                    chatname: socket.chatname
                };
                publishStatusToToipc(JSON.stringify(status), socket.contactId);
                if (currSockets.has(socket.userId)) {
                    currSockets.delete(socket.userId);
                }
        }).error(function(err){
            email.sendChatErrorEmail(err);
        });
        // leave the specific chat that user has joined
        socket.leave(socket.chatname);
    });
}); // end of on.connection