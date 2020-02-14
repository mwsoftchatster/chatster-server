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
var functions = require('/opt/chatster_backend/socketio_group_chat/functions.js');
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
var groupOfflineMessagesRef = ref.child('group_offline_messages');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("./public"));
app.use(cors());

app.use(function(req, res, next) {
    next();
});

var server = https.createServer(options, app).listen(config.port.group_chat_port, function() {
    email.sendNewGroupChatIsUpEmail();
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
            var exchange = 'groupChatMessageForUser.*';
            var key = 'groupChatMessageForUser.' + userId;
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
            var exchange = 'groupChatMessageForUser.*';
            var key = 'groupChatMessageForUser.' + userId;
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
            var exchange = 'groupChatMessageForUser.*';
            var toipcName = 'groupChatMessageForUser.' + userId;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.assertQueue(toipcName, { exclusive: false, auto_delete: true }, function(err, q) {
                ch.bindQueue(q.queue, exchange, toipcName);
                ch.consume(q.queue, function(msg) {
                    var message = JSON.parse(msg.content.toString());
                    if (message.event === 'groupchatmessage') {
                        if (currSockets.has(message.receiverId)) {
                            currSockets.get(message.receiverId).emit(message.event, message);
                        }
                    } else if (message.event === "unbind") {
                        ch.unbindQueue(q.queue, exchange, toipcName);
                        ch.close();
                    } else if (message.event === "unsendMessage") {
                        if (currSockets.has(message.receiverId)) {
                            currSockets.get(message.receiverId).emit(message.event, message);
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
            email.sendGroupChatErrorEmail(err);
            console.error("[AMQP]", err.message);
            return setTimeout(connectToRabbitMQ, 1000);
        }
        conn.on("error", function(err) {
            email.sendGroupChatErrorEmail(err);
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
 * Model of group_chat_offline_message table
 * 
 */
const ReceivedOnlineGroupChatMessage = sequelize.define('received_online_group_chat_message', {
    msg_type: {type: Sequelize.STRING, allowNull: false},
    content_type: {type: Sequelize.STRING, allowNull: false},
    sender_id: { 
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
            model: 'user', key: 'user_id' 
        }
    },
    receiver_id: { type: Sequelize.INTEGER, allowNull: false },
    group_chat_id: { 
        type: Sequelize.STRING,
        allowNull: false,
        references: {
            model: 'group_chat', key: 'group_chat_id' 
        }
    },
    message: {type: Sequelize.STRING, allowNull: false},
    message_uuid: {type: Sequelize.STRING, allowNull: false},
    group_member_one_time_pbk_uuid: {type: Sequelize.STRING, allowNull: false},
    item_created: {type: Sequelize.STRING, allowNull: false}
}, {
  freezeTableName: true, // Model tableName will be the same as the model name
  timestamps: false,
  underscored: true
});

/**
 * Model of group_chat_offline_message table
 * 
 */
const GroupChatOfflineMessage = sequelize.define('group_chat_offline_message', {
    msg_type: {type: Sequelize.STRING, allowNull: false},
    content_type: {type: Sequelize.STRING, allowNull: false},
    sender_id: { 
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
            model: 'user', key: 'user_id' 
        }
    },
    receiver_id: { type: Sequelize.INTEGER, allowNull: false },
    group_chat_id: { 
        type: Sequelize.STRING,
        allowNull: false,
        references: {
            model: 'group_chat', key: 'group_chat_id' 
        }
    },
    message: {type: Sequelize.STRING, allowNull: false},
    message_uuid: {type: Sequelize.STRING, allowNull: false},
    group_member_one_time_pbk_uuid: {type: Sequelize.STRING, allowNull: false},
    item_created: {type: Sequelize.STRING, allowNull: false}
}, {
  freezeTableName: true, // Model tableName will be the same as the model name
  timestamps: false,
  underscored: true
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

function findObjectByKey(array, key, value) {
    for (var i = 0; i < array.length; i++) {
        if (array[i][key] === value) {
            return array[i];
        }
    }
    return null;
}


/**
 *  SOCKET.IO listeners
 */
io.sockets.on("connection", function(socket) {
    /**
     *  on.groupchat handles messages
     */
    socket.on("groupchat", function(messages, senderPublicKeyUUID) {
        // Convert the strigified json containing all encrypted group message objects to json
        var groupChatOfflineMessages = JSON.parse(messages);
        var uuid = groupChatOfflineMessages.groupChatOfflineMessages[0].message_uuid;

        var allPBKUUIDS = [];
        allPBKUUIDS.push(senderPublicKeyUUID);

        var myutc = time.getCurrentUTC();
        // Check who is online for this group
        sequelize.query('CALL GetAllOnlineGroupChatMembers(?)',
        { replacements: [ groupChatOfflineMessages.groupChatOfflineMessages[0].group_chat_id ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                if(result.length > 0){
                    // first, send the message to everyone, except sender, who is connected to this group chat room
                    // fetch all group members who are currently connected
                    var onlineGroupChatMembers = [];
                    for(var m = 0; m < result.length; m++){
                        onlineGroupChatMembers.push(result[m].online_group_chat_member_id);
                    }
                    // remove message sender from the list to avoid sending the message to self
                    var senderIdIndex = onlineGroupChatMembers.indexOf(groupChatOfflineMessages.groupChatOfflineMessages[0].sender_id.toString());
                    onlineGroupChatMembers.splice(senderIdIndex, 1);

                    var receivedOnlineGroupChatMessages = [];

                    // send the online message to all online users
                    for (var i = 0; i < onlineGroupChatMembers.length; i++) {
                        let groupChatOfflineMessage = groupChatOfflineMessages.groupChatOfflineMessages.find(obj => obj.receiver_id === onlineGroupChatMembers[i]);
                            
                        groupChatOfflineMessage.item_created = myutc;
                        receivedOnlineGroupChatMessages.push(groupChatOfflineMessage);
                            
                        // add this message group one time key uuid to the array so it would be deleted once processed
                        allPBKUUIDS.push(groupChatOfflineMessage.group_member_one_time_pbk_uuid);

                        // prepare message object to send
                        var msg = {
                            msgType: groupChatOfflineMessage.content_type,
                            senderId: groupChatOfflineMessage.sender_id,
                            receiverId: groupChatOfflineMessage.receiver_id,
                            groupChatId: groupChatOfflineMessage.group_chat_id,
                            messageText: groupChatOfflineMessage.message,
                            uuid: groupChatOfflineMessage.message_uuid,
                            groupMemberPBKUUID: groupChatOfflineMessage.group_member_one_time_pbk_uuid,
                            messageCreated: myutc,
                            event: "groupchatmessage"
                        };
                        publishMessageToToipc(JSON.stringify(msg), onlineGroupChatMembers[i]);
                    }

                    // save received online messages untill receiver acknowledges them
                    ReceivedOnlineGroupChatMessage.bulkCreate(receivedOnlineGroupChatMessages, { fields: ['msg_type', 'content_type', 'sender_id', 'receiver_id', 'group_chat_id', 'message', 'message_uuid', 'group_member_one_time_pbk_uuid', 'item_created'] }).then(() => {
                        sequelize.query('CALL DeleteGroupOneTimePublicKeysByUUID(?)',
                        { replacements: [ allPBKUUIDS.toString() ],
                            type: sequelize.QueryTypes.RAW }).then(result => {
                        }).error(function(err){
                            email.sendChatErrorEmail(err);
                            respondWithMessageDeliveryStatus(uuid, "error", socket);
                        });
                    }).error(function(err){
                        email.sendGroupChatErrorEmail(err);
                    });
                }

                // handle the message for all the group members who are currently offline
                var offlineGroupChatMembersMessages = [];
                sequelize.query('CALL GetAllOfflineGroupChatMembers(?)',
                { replacements: [ groupChatOfflineMessages.groupChatOfflineMessages[0].group_chat_id ],
                    type: sequelize.QueryTypes.RAW }).then(result => {
                        if(result.length > 0){
                            var offlineGroupChatMembers = [];
                            for(var n = 0; n < result.length; n++){
                                offlineGroupChatMembers.push(result[n].group_chat_member_id);

                                let groupChatOfflineMessage = groupChatOfflineMessages.groupChatOfflineMessages.find(obj => obj.receiver_id === result[n].group_chat_member_id);
                                groupChatOfflineMessage.item_created = myutc;

                                // add this message group one time key uuid to the array so it would be deleted once processed
                                allPBKUUIDS.push(groupChatOfflineMessage.group_member_one_time_pbk_uuid);

                                offlineGroupChatMembersMessages.push(groupChatOfflineMessage);
                            }

                            GroupChatOfflineMessage.bulkCreate(offlineGroupChatMembersMessages, { fields: ['msg_type', 'content_type', 'sender_id', 'receiver_id', 'group_chat_id', 'message', 'message_uuid', 'group_member_one_time_pbk_uuid', 'item_created'] }).then(() => {
                                sequelize.query('CALL DeleteGroupOneTimePublicKeysByUUID(?)',
                                { replacements: [ allPBKUUIDS.toString() ],
                                    type: sequelize.QueryTypes.RAW }).then(result => {
                                        var firebaseGroupOfflineMessage = {
                                            receiver_ids: offlineGroupChatMembers
                                        };
                                        groupOfflineMessagesRef.child(uuid).set(firebaseGroupOfflineMessage);
                                        respondWithMessageDeliveryStatus(uuid, "success", socket);
                                }).error(function(err){
                                    email.sendChatErrorEmail(err);
                                    respondWithMessageDeliveryStatus(uuid, "error", socket);
                                });
                            }).error(function(err){
                                email.sendGroupChatErrorEmail(err);
                                respondWithMessageDeliveryStatus(uuid, "error", socket);
                            });
                        }else{
                            respondWithMessageDeliveryStatus(uuid, "error", socket);
                        }
                }).error(function(err){
                    email.sendGroupChatErrorEmail(err);
                    respondWithMessageDeliveryStatus(uuid, "error", socket);
                });
        }).error(function(err){
            email.sendGroupChatErrorEmail(err);
            respondWithMessageDeliveryStatus(uuid, "error", socket);
        });
    });
    

    /**
     *  on.unsendMessage handles un-sending of group chat messages
     */
    socket.on("unsendMessage", function(senderId, groupChatId, uuid) {
        var myutc = time.getCurrentUTC();
        // first, send the message to everyone, except sender, who is connected to this group chat room
        // socket.broadcast.to(socket.groupChatId).emit("unsendMessage", msg);
        // socket.to(socket.groupChatId).emit('unsendMessage', msg);
        // check who is not connected to this group chat room and save offline group chat message document so that they receive it later
        sequelize.query('CALL GetAllOnlineGroupChatMembers(?)',
        { replacements: [ groupChatId ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                if(result.length > 0){
                    // first, send the message to everyone, except sender, who is connected to this group chat room
                    // socket.broadcast.to(socket.groupChatId).emit("groupchatmessage", msg);
                    // fetch all group members who are currently connected
                    var onlineGroupChatMembers = [];
                    for(var j = 0; j < result.length; j++){
                        onlineGroupChatMembers.push(result[j].online_group_chat_member_id);
                    }
                    // remove message sender from the list to avoid sending the message to self
                    var senderIdIndex = onlineGroupChatMembers.indexOf(senderId.toString());
                    onlineGroupChatMembers.splice(senderIdIndex, 1);
                    // send the online message to all online users
                    for (var i = 0; i < onlineGroupChatMembers.length; i++) {
                        // prepare message object to send
                        var msg = {
                            msgType: "unsendMessage",
                            senderId: senderId,
                            receiverId: onlineGroupChatMembers[i],
                            groupChatId: groupChatId,
                            messageText: "unsendMessageGroup",
                            uuid: uuid,
                            event: "unsendMessage"
                        };
                        publishMessageToToipc(JSON.stringify(msg), onlineGroupChatMembers[i]);
                    }
                    // handle the message for all the group members who are currently offline
                    sequelize.query('CALL GetAllOfflineGroupChatMembers(?)',
                    { replacements: [ groupChatId ],
                        type: sequelize.QueryTypes.RAW }).then(result => {
                            if(rows[0].length > 0){
                                var receiver_ids = [];
                                for(var i = 0; i < result.length; i++){
                                    receiver_ids.push(result[i].group_chat_member_id);
                                }
                                var offlineGroupChatMembers = receiver_ids.toString();
                                // handle the message for all the group members who are currently offline
                                sequelize.query('CALL ProcessNewGroupChatOfflineMessage(?,?,?,?,?,?,?,?)',
                                { replacements: [ "unsendMessageGroup", "unsendMessageGroup", senderId.toString(), groupChatId, "unsendMessageGroup", uuid, myutc, offlineGroupChatMembers ],
                                    type: sequelize.QueryTypes.RAW }).then(result => {
                                        var firebaseGroupOfflineMessage = {
                                            receiver_ids: receiver_ids
                                        };
                                        groupOfflineMessagesRef.child(uuid).set(firebaseGroupOfflineMessage);
                                }).error(function(err){
                                    email.sendGroupChatErrorEmail(err);
                                    respondWithMessageDeliveryStatus(uuid, "error", socket);
                                });
                            }
                    }).error(function(err){
                        email.sendGroupChatErrorEmail(err);
                        respondWithMessageDeliveryStatus(uuid, "error", socket);
                    });
                }
        }).error(function(err){
            email.sendGroupChatErrorEmail(err);
            respondWithMessageDeliveryStatus(uuid, "error", socket);
        });
    });
    

    /**
     *  on.opengroupchat sets up group chat room
     */
    socket.on("opengroupchat", function(userId, groupChatId) {
        socket.groupChatId = groupChatId;
        socket.userId = userId.toString();
        if (currSockets.has(socket.userId)) {
            currSockets.delete(socket.userId);
            currSockets.set(socket.userId, socket);
        } else {
            currSockets.set(socket.userId, socket);
        }
        subscribeToTopic(socket.userId);
        sequelize.query('CALL InsertNewOnlineGroupChatMember(?,?,?)',
        { replacements: [ groupChatId, userId.toString(), time.getCurrentUTC() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                socket.groupChatId = groupChatId;
                socket.join(socket.groupChatId);
        }).error(function(err){
            email.sendGroupChatErrorEmail(err);
        });
    });


    /**
     *  on.groupMessageReceived handles group message received confirmation by the client
     */
    socket.on("groupMessageReceived", function(uuid, receiverId) {
        var groupMessageReceivedResponseError = {
            status: "error",
            uuid: uuid
        };
        var groupMessageReceivedResponseSuccess = {
            status: "success",
            uuid: uuid
        };
        sequelize.query('CALL DeleteReceivedOnlineGroupMessage(?,?)',
        { replacements: [ uuid, receiverId.toString() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                socket.emit('groupMessageReceived', groupMessageReceivedResponseSuccess);
        }).error(function(err){
            email.sendGroupChatErrorEmail(err);
            socket.emit('groupMessageReceived', groupMessageReceivedResponseError);
        });
    });


    /**
     *  on.disconnect handles leaving group chat room
     */
    socket.on("disconnect", function() {
        // unbind your own queue as you are leaving and you won't be consuming messages anymore
        var unbindMyQueue = {
            value: "Unbind My Queue",
            event: "unbind"
        };
        publishStatusToToipc(JSON.stringify(unbindMyQueue), socket.userId);
        sequelize.query('CALL DeleteOnlineGroupChatMember(?,?)',
        { replacements: [ socket.groupChatId, socket.userId ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                if (currSockets.has(socket.userId)) {
                    currSockets.delete(socket.userId);
                }
        }).error(function(err){
            email.sendGroupChatErrorEmail(err);
        });
        socket.leave(socket.groupChatId);
    });
}); // end of on.connection