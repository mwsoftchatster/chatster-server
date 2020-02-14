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
var fs = require('fs');
var path = require('path');
var config = require('/opt/chatster_backend/chatster_config/chatster_config.js');

var email = require('/opt/chatster_backend/chatster_email/chatster_email.js');
var time = require('/opt/chatster_backend/chatster_time/chatster_time.js');



/**
 *  Setup the pool of connections to the db so that every connection can be reused upon it's release
 *
 */
var mysql = require('mysql');
var Sequelize = require('sequelize');
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
 *  Sends notification error message
 * (newOnlineReceivedMessages array): response array that is used to send user error response
 * (res Object): response object that is used to send user response
 */
function sendNotificationsErrorMessage(newOnlineReceivedMessages, res) {
  var receivedOnlineErrorMessage = {
      returnType: "error",
      msgType: "groupChatMsg",
      contentType: "error",
      senderId: 0,
      senderName: "error",
      groupChatId: "error",
      messageText: "error",
      uuid: "error",
      messageCreated: "error"
  };
  newOnlineReceivedMessages.push(receivedOnlineErrorMessage);
  res.json(newOnlineReceivedMessage);
}

/**
 *  Deletes retrieved messages and checks if there are new messages availble
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.deleteRetrievedMessages = function (req, res){
  var newOnlineReceivedMessages = [];
  sequelize.query('CALL ProcessReceivedOnlineMessages(?,?)',
  { replacements: [ req.query.dstId, req.query.uuids.toString() ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          for (var i = 0; i < result.length; i++) {
              var receivedOnlineMessage = {
                  returnType: "success",
                  msgType: "chatMsg",
                  contentType: result[i].content_type,
                  senderId: result[i].sender_id,
                  chatname: result[i].chat_name,
                  messageText: result[i].message,
                  uuid: result[i].message_uuid,
                  contactPublicKeyUUID: result[i].contact_public_key_uuid,
                  messageCreated: result[i].item_created
              };
              newOnlineReceivedMessages.push(receivedOnlineMessage);
          }
          res.json(newOnlineReceivedMessages);
  }).error(function(err){
      email.sendNotificationsErrorEmail(err);
      sendNotificationsErrorMessage(newOnlineReceivedMessages, res);
  });
};

/**
 *  Deletes retrieved group messages and checks if there are new messages availble
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.deleteRetrievedGroupMessages = function (req, res){
  var newOnlineReceivedMessages = [];
  sequelize.query('CALL ProcessReceivedGroupOnlineMessages(?,?)',
  { replacements: [ req.query.dstId, req.query.uuids.toString() ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              for (var j = 0; j < result.length; j++) {
                  var receivedOnlineGroupMessage = {
                      returnType: "success",
                      msgType: "groupChatMsg",
                      contentType: result[j].content_type,
                      senderId: result[j].sender_id,
                      groupChatId: result[j].group_chat_id,
                      messageText: result[j].message,
                      uuid: result[j].message_uuid,
                      contactPublicKeyUUID: result[i].group_member_one_time_pbk_uuid,
                      messageCreated: result[j].item_created
                  };
                  newOnlineReceivedMessages.push(receivedOnlineGroupMessage);
              }
          }
          res.json(newOnlineReceivedMessages);
  }).error(function(err){
      email.sendNotificationsErrorEmail(err);
      sendNotificationsErrorMessage(newOnlineReceivedMessages, res);
  });
};


/**
 *  Retrieves offline chat messages
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.chatOfflineMessages = function (req, res){
  var offlineMsgs = [];
  sequelize.query('CALL GetOfflineMessages(?)',
  { replacements: [ req.query.dstId ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          for (var i = 0; i < result.length; i++) {
              var offlineMessage = {
                  msgType: result[i].msg_type,
                  contentType: result[i].content_type,
                  senderId: result[i].sender_id,
                  senderName: result[i].user_name,
                  receiverId: result[i].receiver_id,
                  chatName: result[i].chat_name,
                  messageData: result[i].message,
                  uuid: result[i].message_uuid,
                  contactPublicKeyUUID: result[i].contact_public_key_uuid,
                  messageCreated: result[i].item_created
              };
              offlineMsgs.push(offlineMessage);
          }
          res.json(offlineMsgs);
  }).error(function(err){
      email.sendNotificationsErrorEmail(err);
      res.json(offlineMsgs);
  });
};

/**
 *  Retrieves offline group chat messages
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.groupOfflineMessages = function (req, res){
  var offlineMsgs = [];
  sequelize.query('CALL GetOfflineGroupMessages(?)',
  { replacements: [ req.query.dstId ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          for (var i = 0; i < result.length; i++) {
              var groupChatOfflineMessage = {
                  msgType: result[i].msg_type,
                  contentType: result[i].content_type,
                  groupChatId: result[i].group_chat_id,
                  senderId: result[i].sender_id,
                  messageText: result[i].message,
                  uuid: result[i].message_uuid,
                  contactPublicKeyUUID: result[i].group_member_one_time_pbk_uuid,
                  messageCreated: result[i].item_created
              };
              offlineMsgs.push(groupChatOfflineMessage);
          }
          res.json(offlineMsgs);
  }).error(function(err){
      email.sendNotificationsErrorEmail(err);
      res.json(offlineMsgs);
  });
};

/**
 *  Retrieves  group chat invitations
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.groupChatInvitations = function (req, res){
  var GroupChatInvitations = [];
  sequelize.query('CALL GetGroupChatInvitation(?)',
  { replacements: [ req.query.dstId ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          var groupChatInvitation = {
              msgType: "groupChatInvitation",
              groupChatInvitationChatId: result[0].group_chat_id,
              groupChatInvitationChatName: result[0].group_chat_name,
              groupProfilePicPath: result[0].group_chat_image,
              groupChatInvitationSenderId: result[0].group_chat_invitation_sender_id,
              groupChatInvitationGroupChatMembers: []
          };
          sequelize.query('CALL GetGroupChatMembers(?)',
          { replacements: [ groupChatInvitation.groupChatInvitationChatId ],
              type: sequelize.QueryTypes.RAW }).then(result => {
                  console.log(result);
                  for(var m = 0; m < result.length; m++){
                      groupChatInvitation.groupChatInvitationGroupChatMembers.push(result[m].group_chat_invitee_id);
                  }
                  GroupChatInvitations.push(groupChatInvitation);
                  res.json(GroupChatInvitations);
          }).error(function(err){
              email.sendNotificationsErrorEmail(err);
              res.json(GroupChatInvitations);
          });
  }).error(function(err){
      email.sendNotificationsErrorEmail(err);
      res.json(GroupChatInvitations);
  });
};



