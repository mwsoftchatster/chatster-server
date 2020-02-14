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
var functions = require('/opt/chatster_backend/chatster_api_notifications/functions.js');
var fs = require("fs");
var express = require("express");
var https = require('https');
var options = {
    key: fs.readFileSync(config.security.key),
    cert: fs.readFileSync(config.security.cert)
};
var app = express();
var bodyParser = require("body-parser");
var cors = require("cors");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("./public"));
app.use(cors());

app.use(function(req, res, next) {
    next();
});

var server = https.createServer(options, app).listen(config.port.api_notifications_port, function() {
    email.sendNewNotificationApiIsUpEmail();
});


/**
 *  POST remove all 1:1 chat online/offline messages that were retrieved by the user
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/deleteRetrievedMessages", function(req, res) {
    functions.deleteRetrievedMessages(req, res);
});


/**
 *  POST remove all group chat online/offline messages that were retrieved by the user
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/deleteRetrievedGroupMessages", function(req, res) {
    functions.deleteRetrievedGroupMessages(req, res);
});


/**
 *  GET all 1-to-1 chat offline messages for the user with id
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.get("/chatOfflineMessages", function(req, res) {
    functions.chatOfflineMessages(req, res);
});


/**
 *  GET all groupOffline messages for the user with id and all of the users group chat ids
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.get("/groupOfflineMessages", function(req, res) {
    functions.groupOfflineMessages(req, res);
});


/**
 *  GET all group chat invitations for the user with id
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.get("/groupChatInvitations", function(req, res) {
    functions.groupChatInvitations(req, res);
});
                       