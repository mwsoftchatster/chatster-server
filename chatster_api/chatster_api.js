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
var email = require('/opt/chatster_backend/chatster_email/chatster_email.js');
var functions = require('/opt/chatster_backend/chatster_api/functions.js');
var fs = require("fs");
var express = require("express");
var http = require('http');
var https = require('https');
var options = {
    key: fs.readFileSync(config.security.key),
    cert: fs.readFileSync(config.security.cert)
};
var app = express();
var bodyParser = require("body-parser");
var cors = require("cors");
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.raw({ limit: '50mb' }));
app.use(bodyParser.text({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: false }));
app.use(express.static("./public"));
app.use(cors());

app.use(function(req, res, next) {
    next();
});

var server = https.createServer(options, app).listen(config.port.api_port, function() {
    email.sendNewApiIsUpEmail();
});


/**
 *  SOCKET.IO listeners
 */
var io = require("socket.io")(server, { transports: ['websocket'] });
io.sockets.on("connection", function(socket) {
    /**
     * on.checkUserNameAvailability checks if user name is available
     */
    socket.on("checkUserNameAvailability", function(userName) {
        functions.checkIfUserNameIsAvailable(userName,socket);
    });
    
    /**
     * on.updateUser listens for update user info events
     */
    socket.on("updateUser", function(userId, statusMessage, profilePic) {
        // send post req to img server to update profile pic
        functions.updateUserProfilePic(userId, statusMessage, profilePic, socket);
    });
    
    /**
     * on.updateGroup listens for update group info events
     */
    socket.on("updateGroup", function(groupId, statusMessage, profilePic) {
        // send post request to img server
        functions.updateGroupProfilePic(groupId, statusMessage, profilePic, socket);
    });
    
    /**
     * on.unsendAllow listens for allow unsend messages events
     */
    socket.on("unsendAllow", function(userId, contactId) {
        functions.updateUserIsAllowedToUnsend(userId, contactId, socket);
    });
    
    /**
     * on.unsendForbid listens for forbid unsend messages events
     */
    socket.on("unsendForbid", function(userId, contactId) {
        functions.updateUserIsNotAllowedToUnsend(userId, contactId, socket);
    });
    
    /**
     * on.disconnect listens for disconnect events
     */
    socket.on("disconnect", function() {});
}); 


/**
 *  DELETE exit group chat with group chat _id and userid
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.delete("/exitGroupChat", function(req, res) {
    functions.exitGroupChat(req, res);
});


/**
 *  GET contactLatest request
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.get("/contactLatest", function(req, res) {
    functions.getContactLatest(req,res);
});


/**
 *  POST deleteGroupChatInvitation request
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/deleteGroupChatInvitation", function(req, res) {
    functions.deleteGroupChatInvitation(req, res);
});


/**
 *  POST createGroupChat request
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/createGroupChat", function(req, res) {
    functions.createGroupChat(req, res);
});


/**
 *  POST createUser request
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/createUser", function(req, res) {
    functions.createUser(req, res);
});


/**
 *  POST adds new member to group chat
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/addNewMembersToGroupChat", function(req, res) {
    functions.addNewMembersToGroupChat(req, res);
});


/**
 *  POST verify phone number for the user with phone number
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/verifyPhone", function(req, res) {
    functions.verifyPhone(req,res);
});


/**
 *  POST resend chat message if initially failed
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/resendChatMessage", function(req, res) {
    functions.resendChatMessage(req, res);
});


/**
 *  POST update user messaging token
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/updateUserMessagingToken", function(req, res) {
    functions.updateUserMessagingToken(req, res);
});


/**
 *  POST resend group chat message if initially failed
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/resendGroupChatMessage", function(req, res) {
    functions.resendGroupChatMessage(req,res);
});


/**
 *  POST invite user to join Chatster
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/inviteUser", function(req, res) {
    functions.inviteUser(req,res);
});


/**
 *  POST upload public one time keys
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/uploadPublicKeys", function(req, res) {
    functions.uploadPublicKeys(req, res);
});


/**
 *  POST upload public one time keys
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/uploadReRegisterPublicKeys", function(req, res) {
    functions.uploadReRegisterPublicKeys(req, res);
});


/**
 *  POST checks if users public keys need to be replenished
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/checkPublicKeys", function(req, res) {
    functions.checkPublicKeys(req, res);
});


/**
 *  GET Fetches one one time public key
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.get("/getOneTimePublicKey", function(req, res) {
    functions.getOneTimePublicKey(req, res);
});

/**
 *  GET Fetches one one time public key by UUID
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.get("/getOneTimePublicKeyByUUID", function(req, res) {
    functions.getOneTimePublicKeyByUUID(req, res);
});


/**
 *  POST upload group public one time keys
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/uploadGroupPublicKeys", function(req, res) {
    functions.uploadGroupPublicKeys(req, res);
});


/**
 *  Fetches group one time public keys for one group message
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.get("/getGroupOneTimeKeys", function(req, res) {
    functions.getGroupOneTimeKeys(req, res);
});


/**
 *  Checks if group one time public keys need to be replenished
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/checkIfGroupKeysNeeded", function(req, res) {
    functions.checkIfGroupKeysNeeded(req, res);
});