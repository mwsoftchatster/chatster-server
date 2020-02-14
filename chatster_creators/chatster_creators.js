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
var functions = require('/opt/chatster_backend/chatster_creators/functions.js');
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
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.raw({ limit: '100mb' }));
app.use(bodyParser.text({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: false }));
app.use(express.static("./public"));
app.use(cors());

app.use(function(req, res, next) {
    next();
});

var server = https.createServer(options, app).listen(config.port.creator_port, function() {
    email.sendNewCreatorsIsUpEmail();
});


/**
 *  SOCKET.IO listeners
 */
var io = require("socket.io")(server, { transports: ['websocket'] });
io.sockets.on("connection", function(socket) {
    /**
     * on.saveCreatorPost listens for new posts
     */
    socket.on("saveCreatorTextPost", function(userName, postCapture, postType, creatorProfilePic, postText, postUUID) {
        functions.saveCreatorTextPost(userName, postCapture, postType, creatorProfilePic, postText, postUUID, socket);
    });
    
    /**
     * on.saveCreatorPost listens for new posts
     */
    socket.on("saveCreatorPost", function(userName, postCapture, postType, creatorProfilePic, post, postUUID) {
        functions.saveCreatorPost(userName, postCapture, postType, creatorProfilePic, post, postUUID, socket);
    });

    /**
     * on.updateCreatorPost listens for post updates
     */
    socket.on("updateCreatorPost", function(userName, postCapture, creatorProfilePic, post, postUUID) {
        functions.updateCreatorPost(userName, postCapture, creatorProfilePic, post, postUUID, socket);
    });

    /**
     * on.likeCreatorPost listens for post likes
     */
    socket.on("likeCreatorPost", function(userName, postUUID, userProfilePicUrl) {
        functions.likeCreatorPost(userName, postUUID, userProfilePicUrl, socket);
    });

    /**
     * on.unlikeCreatorPost listens for post unlikes
     */
    socket.on("unlikeCreatorPost", function(userName, postUUID, userProfilePicUrl) {
        functions.unlikeCreatorPost(userName, postUUID, userProfilePicUrl, socket);
    });

    /**
     * on.postCommentForCreatorPost listens for post comments
     */
    socket.on("postCommentForCreatorPost", function(userName, userProfilePicUrl, postUUID, comment) {
        functions.postCommentForCreatorPost(userName, userProfilePicUrl, postUUID, comment, socket);
    });

    /**
     * on.deleteCreatorPost listens for post delete
     */
    socket.on("deleteCreatorPost", function(postUUID) {
        functions.deleteCreatorPost(postUUID, socket);
    });

    /**
     * on.connectWithCreator listens for new followers
     */
    socket.on("connectWithCreator", function(userId, userName, photoUrl, creatorName) {
        functions.connectWithCreator(userId, userName, photoUrl, creatorName, socket);
    });

    /**
     * on.disconnectWithCreator listens for new unfollowers
     */
    socket.on("disconnectWithCreator", function(userId, userName, photoUrl, creatorName) {
        functions.disconnectWithCreator(userId, userName, photoUrl, creatorName, socket);
    });

    /**
     * on.searchForCreator listens for search requests
     */
    socket.on("searchForCreator", function(userId,creatorName) {
        functions.searchForCreator(userId,creatorName, socket);
    });

    /**
     * on.disconnect listens for disconnect events
     */
    socket.on("disconnect", function() {});
});


/**
 *  POST latest 100 posts request 
 */
app.post("/discoverPosts", function(req, res) {
    functions.discoverPosts(req, res);
});


/**
 *  POST latest 100 posts request 
 */
app.post("/latestPosts", function(req, res) {
    functions.latestPosts(req, res);
});


/**
 *  POST creator activity request
 */
app.post("/creatorHistory", function(req, res) {
    functions.creatorHistory(req, res);
});


/**
 *  POST get all comments for post with uuid
 */
app.post("/creatorPostComments", function(req, res) {
    functions.creatorPostComments(req, res);
});


/**
 *  POST get creators profile
 */
app.post("/creatorContactProfile", function(req, res) {
    functions.creatorContactProfile(req, res);
});


/**
 *  POST get all posts for creator with id
 */
app.post("/creatorPosts", function(req, res) {
    functions.creatorPosts(req, res);
});


/**
 *  POST get all posts for creator with id and after certain date
 */
app.post("/loadMorePosts", function(req, res) {
    functions.loadMorePosts(req, res);
});


/**
 *  POST get all following for creator with _id
 */
app.post("/creatorFollows", function(req, res) {
    functions.creatorFollows(req, res);
});


/**
 *  POST get 100 followers for creator with _id
 */
app.post("/creatorFollowers", function(req, res) {
    functions.creatorFollowers(req, res);
});


/**
 *  POST upload video post
 */
app.post("/uploadVideoPost", function(req, res) {
    functions.uploadVideoPost(req, res);
});