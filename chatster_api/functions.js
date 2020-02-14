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
var aws = require("aws-sdk");
var s3 = new aws.S3();
var admin = require('firebase-admin');
var serviceAccount = require(config.firebase.service_account);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.firebase.databaseURL
});
var db = admin.database();
var ref = db.ref();
var usersRef = ref.child('users');
var groupChatInvitationsRef = ref.child('group_chat_invitations');
var offlineMessagesRef = ref.child('offline_messages');
var groupOfflineMessagesRef = ref.child('group_offline_messages');
var rn = require('random-number');
var gen = rn.generator({
    min: 1000,
    max: 9999,
    integer: true
});
var contentType = require('content-type');
var fileType = require('file-type');
var multer = require('multer');
const uploadImageMessage = multer({
    dest: 'images/',
    limits: { fileSize: 10000000, files: 1 },
    fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(jpg|jpeg)$/)) {
            return callback(new Error('Only Images are allowed !'), false)
        }
        callback(null, true);
    }
}).single('image');
const uploadGroupImageMessage = multer({
    dest: 'imagesGroup/',
    limits: { fileSize: 10000000, files: 1 },
    fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(jpg|jpeg)$/)) {
            return callback(new Error('Only Images are allowed !'), false)
        }
        callback(null, true);
    }
}).single('image');

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
 * Model of user_one_time_pre_key_pair table
 * 
 */
const OneTimePreKey = sequelize.define('user_one_time_pre_key_pair', {
    user_id: { 
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
                model: 'user', key: 'user_id' 
            }
        },
    one_time_pre_key_pair_pbk: {type: Sequelize.BLOB('long'), allowNull: false},
    one_time_pre_key_pair_uuid: {type: Sequelize.STRING, allowNull: false}
}, {
  freezeTableName: true, // Model tableName will be the same as the model name
  timestamps: false,
  underscored: true
});


/**
 *  Saves public one time keys into db
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.uploadPublicKeys = function(req,res){
    var oneTimePreKeyPairPbks = JSON.parse(req.query.oneTimePreKeyPairPbks);

    OneTimePreKey.bulkCreate(oneTimePreKeyPairPbks.oneTimePreKeyPairPbks, { fields: ['user_id','one_time_pre_key_pair_pbk', 'one_time_pre_key_pair_uuid'] }).then(() => {
        res.json("success");
        }).error(function(err){
        email.sendChatErrorEmail(err);
        res.json("error");
    });
};


/**
 *  Saves public one time keys into db
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.uploadReRegisterPublicKeys = function(req,res){
    var oneTimePreKeyPairPbks = JSON.parse(req.query.oneTimePreKeyPairPbks);

    sequelize.query('CALL DeleteOldOneTimePublicKeysByUserId(?)',
    { replacements: [ req.query.userId ],
        type: sequelize.QueryTypes.RAW }).then(result => {
            OneTimePreKey.bulkCreate(oneTimePreKeyPairPbks.oneTimePreKeyPairPbks, { fields: ['user_id','one_time_pre_key_pair_pbk', 'one_time_pre_key_pair_uuid'] }).then(() => {
                res.json("success");
              }).error(function(err){
                email.sendChatErrorEmail(err);
                res.json("error");
            });
    }).error(function(err){
        email.sendChatErrorEmail(err);
        res.json("error");
    });
};

/**
 *  Checks if users public keys need to be replenished
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.checkPublicKeys = function(req,res){
    sequelize.query('CALL CheckIfNewPublicKeysNeeded(?)',
    { replacements: [ req.query.userId ],
        type: sequelize.QueryTypes.RAW }).then(result => {
            if(result[0].keys_left > 100) {
                res.json("no");
            }else{
                res.json("yes");
            } 
    }).error(function(err){
        email.sendChatErrorEmail(err);
        res.json("error");
    });
};


/**
 *  Fetches one one time public key
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.getOneTimePublicKey = function(req,res){
    var oneTimePublicKey = {
        userId: req.query.contactId,
        oneTimePublicKey: null,
        uuid: null
    };

    sequelize.query(
        "select * from `user_one_time_pre_key_pair` where user_id=" + req.query.contactId + " limit 1",
        { type: sequelize.QueryTypes.SELECT})
        .then(function(result) {
            oneTimePublicKey.oneTimePublicKey = Array.prototype.slice.call(result[0].one_time_pre_key_pair_pbk, 0);
            oneTimePublicKey.uuid = result[0].one_time_pre_key_pair_uuid;
            res.json(oneTimePublicKey);
    });
};


/**
 *  Fetches one one time public key by UUID
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.getOneTimePublicKeyByUUID = function(req,res){
    var oneTimePublicKey = {
        userId: req.query.contactId,
        oneTimePublicKey: null,
        uuid: null
    };

    sequelize.query(
        "select * from `user_one_time_pre_key_pair` where user_id=" + req.query.contactId + " and one_time_pre_key_pair_uuid = '" + req.query.uuid + "'",
        { type: sequelize.QueryTypes.SELECT})
        .then(function(result) {
            oneTimePublicKey.oneTimePublicKey = Array.prototype.slice.call(result[0].one_time_pre_key_pair_pbk, 0);
            oneTimePublicKey.uuid = result[0].one_time_pre_key_pair_uuid;
            res.json(oneTimePublicKey);
    });
};


/**
 * Model of group_one_time_pre_key_pair table
 * 
 */
const OneTimeGroupPreKey = sequelize.define('group_one_time_pre_key_pair', {
    user_id: { 
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
            model: 'user', key: 'user_id' 
        }
    },
    group_id: { 
        type: Sequelize.STRING,
        allowNull: false,
        references: {
            model: 'group_chat', key: 'group_chat_id' 
        }
    },
    group_one_time_pre_key_pair_pbk: {type: Sequelize.BLOB('long'), allowNull: false},
    group_one_time_pre_key_pair_uuid: {type: Sequelize.STRING, allowNull: false}
}, {
  freezeTableName: true, // Model tableName will be the same as the model name
  timestamps: false,
  underscored: true
});


/**
 *  Saves public one time keys into db
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.uploadGroupPublicKeys = function(req,res){
    var oneTimeGroupPreKeyPairPbks = JSON.parse(req.query.oneTimeGroupPreKeyPairPbks);

    OneTimeGroupPreKey.bulkCreate(oneTimeGroupPreKeyPairPbks.oneTimeGroupPreKeyPairPbks, { fields: ['user_id','group_id', 'group_one_time_pre_key_pair_pbk', 'group_one_time_pre_key_pair_uuid'] }).then(() => {
        res.json("success");
    }).error(function(err){
        email.sendApiErrorEmail(err);
        res.json("error");
    });
};


/**
 *  Fetches group one time public keys for one group message
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.getGroupOneTimeKeys = function(req,res){
    var groupOneTimeKeys = [];

    sequelize.query('CALL GetGroupOneTimeKeys(?,?)',
    { replacements: [ req.query.groupChatId, req.query.userId ],
        type: sequelize.QueryTypes.RAW }).then(result => {
            for (var i = 0; i < result.length; i++) {
                var groupOneTimeKey = {
                    userId: result[i].user_id,
                    groupChatId: result[i].group_id,
                    oneTimeGroupPublicKey: Array.prototype.slice.call(result[i].group_one_time_pre_key_pair_pbk, 0),
                    uuid: result[i].group_one_time_pre_key_pair_uuid
                };
                groupOneTimeKeys.push(groupOneTimeKey);
            }
            res.json(groupOneTimeKeys);
    }).error(function(err){
        email.sendApiErrorEmail(err);
        res.json(groupOneTimeKeys);
    });
};


/**
 *  Checks if group one time public keys need to be replenished
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.checkIfGroupKeysNeeded = function(req,res){
    var groupIds = [];

    sequelize.query('CALL CheckIfGroupKeysNeeded(?,?)',
    { replacements: [ req.query.groupChatIds, req.query.userId ],
        type: sequelize.QueryTypes.RAW }).then(result => {
            for (var i = 0; i < result.length; i++) {
                if(result[i].group_keys < 100){
                    groupIds.push(result[i].group_id);
                }
            }
            res.json(groupIds);
    }).error(function(err){
        email.sendApiErrorEmail(err);
        res.json(groupIds);
    });
};


/**
 * Creates creators folder for the user
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 * (image String): base64 encoded String that holds the image
 * (userCallback function): callback function upon successfull storage of the image
 */
function createCreatorFolder(req, res, image, userCallback) {
    let params = {
        Bucket: 'chatster-creator-posts',
        Key: `${req.query.userName}/`,
        ACL: 'public-read',
        Body: 'create folder to store posts for this creator'
    };
    s3.putObject(params, function(err, data) {
        if (!err) {
            saveUserDefaultProfilePic(req, res, image, userCallback);
        } else {
            email.sendApiErrorEmail(err);
            res.json(null);
        }
    });
}


/**
 * Stores default img for each new user
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 * (image String): base64 encoded String that holds the image
 * (userCallback function): callback function upon successfull storage of the image
 */
function saveUserDefaultProfilePic(req, res, data, userCallback) {
    let params = {
        Bucket: 'chatster-users',
        Key: `users/${req.query.userId}.jpg`,
        Body: new Buffer(data, 'base64'),
        ContentEncoding: 'base64',
        ContentType: 'image/jpg'
    };
    s3.putObject(params, function(err, data) {
        if (!err) {
            userCallback(req, res, `//doyyiwyfw4865.cloudfront.net/${params.Key}`);
        } else {
            email.sendApiErrorEmail(err);
            res.json(null);
        }
    });
}


/**
 *  Starts create new user routine
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.createUser = function (req, res) {
    email.sendNewUserRegisteredEmail(req.query.userId, req.query.userName);
    if (req.query.userId !== null && req.query.userName !== null) {
        sequelize.query('CALL GetUserByName(?)',
        { replacements: [ req.query.userName ],
             type: sequelize.QueryTypes.RAW }).then(result => {
                 if(result.length > 0){
                    var responseUser = {
                        _id: 1234567890,
                        name: "unavailable",
                        statusMessage: "unavailable",
                        profilePic: "unavailable",
                        chatsterContacts: [0,0],
                        userAlreadyExists: true
                    };
                    // send the response object in json
                    res.json(responseUser);
                }else{
                    // call img server to create user dir and store default img in it
                    var bitmap = fs.readFileSync(config.path.userDefaultProfilePicLocalPath);
                    // convert binary data to base64 encoded string
                    var data = new Buffer(bitmap).toString('base64');
                    createCreatorFolder(req, res, data, userCallback);
                }
        }).error(function(err){
            email.sendApiErrorEmail(err);
            res.json(null);
        });
    } else {
        res.json(null);
    }
};

/**
 *  Saves new user into database
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 * (userProfilePicS3Url String): URL to the users profile picture
 */
function userCallback(req, res, userProfilePicS3Url) {
    // check if user has entered status message 
    // if not, assign default status message
    var myutc = time.getCurrentUTC();
    var status = "";
    if (req.query.statusMessage != null) {
        if (req.query.statusMessage.length > 0) {
            status = req.query.statusMessage;
        } else {
            status = `Hi, my name is ${req.query.userName}.`;
        }
    } else {
        status = `Hi, my name is ${req.query.userName}.`;
    }

    var chatsterContacts = [];
    sequelize.query('CALL GetUsersWithIdIn(?)',
    { replacements: [ req.query.contacts.toString() ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             if(result.length > 0){
                for (var i = 0; i < result.length; i++) {
                    chatsterContacts.push(parseInt(result[i].user_id));
                }
            }
            var responseUser = {
                _id: parseInt(req.query.userId),
                name: req.query.userName,
                profilePic: userProfilePicS3Url,
                statusMessage: status,
                chatsterContacts: chatsterContacts,
                userAlreadyExists: false
            };
            sequelize.query('CALL SaveNewUser(?,?,?,?,?,?,?,?,?,?,?,?)',
            { replacements: [ req.query.userId, req.query.userName, userProfilePicS3Url, status, myutc, myutc, 0, 0, 0, 'No website added', req.query.contacts.toString(), myutc ],
                 type: sequelize.QueryTypes.RAW }).then(result => {
                     var firebaseUser = {
                        messaging_token: req.query.messagingToken
                    };
                    usersRef.child(req.query.userId).set(firebaseUser); 

                    var oneTimePreKeyPairPbks = JSON.parse(req.query.oneTimePreKeyPairPbks);
                    OneTimePreKey.bulkCreate(oneTimePreKeyPairPbks.oneTimePreKeyPairPbks, { fields: ['user_id','one_time_pre_key_pair_pbk', 'one_time_pre_key_pair_uuid'] }).then(() => {
                        res.json(responseUser);
                    });
            }).error(function(err){
                email.sendApiErrorEmail(err);
                res.json(null);
            });
    }).error(function(err){
        email.sendApiErrorEmail(err);
        res.json(null);
    });
}


/**
 *  Checks if user name is available
 *
 * (userName String): name to be checked fot availability
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.checkIfUserNameIsAvailable = function (userName,socket){
    sequelize.query('CALL GetUserByName(?)',
    { replacements: [ userName ],
         type: sequelize.QueryTypes.RAW }).then(result => {
            if(result.length > 0){
                socket.emit("checkUserNameAvailability", "unavailable");
            }else{
                socket.emit("checkUserNameAvailability", "available");
            } 
    }).error(function(err){
        email.sendApiErrorEmail(err);
        socket.emit("checkUserNameAvailability", "error");
    });
};


/**
 *  Updates user profile pic and status message
 *
 * (userId int): id of the user who's profile picture and status are to be updated
 * (statusMessage String): status message
 * (profilePicUrl String): URL to profile picture
 * (socket Object): Socket.IO object that is used to send user response
 */
function updateStatusAndProfilePic(userId, statusMessage, profilePicUrl, socket){
    // update statusMessage and profile pic for user with id
    sequelize.query('CALL UpdateUserStatusAndProfilePicture(?,?,?)',
        { replacements: [ userId.toString(), statusMessage, profilePicUrl ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                socket.emit("updatedUser", "success");
    }).error(function(err){
        email.sendApiErrorEmail(err);
        socket.emit("updatedUser", "error");
    });
}

module.exports.updateUserProfilePic = function (userId, statusMessage, profilePic, socket) {
    let params = {
        Bucket: 'chatster-users',
        Key: `users/${userId}.jpg`,
        Body: new Buffer(profilePic, 'base64'),
        ContentEncoding: 'base64',
        ContentType: 'image/jpg'
    };
    s3.putObject(params, function(err, data) {
        if (err) {
            socket.emit("updatedUser", "error");
            email.sendApiErrorEmail(err);
        }else{
            var profilePicUrl = `//doyyiwyfw4865.cloudfront.net/${params.Key}`;
            updateStatusAndProfilePic(userId, statusMessage, profilePicUrl, socket);
        }
    });
};

/**
 *  Updates group profile pic and status message
 *
 * (groupId String): id of the group of which profile picture and status are to be updated
 * (statusMessage String): status message
 * (profilePicUrl String): URL to profile picture
 * (socket Object): Socket.IO object that is used to send user response
 */
function updateGroupPicAndStatus(groupId, statusMessage, profilePicUrl, socket){
    // update groupChatImage and groupChatStatusMessage for group with id
    sequelize.query('CALL UpdateGroupStatusAndProfilePicture(?,?,?)',
    { replacements: [ groupId, statusMessage, profilePicUrl ],
         type: sequelize.QueryTypes.RAW }).then(result => {
            socket.emit("updatedGroup", "success");
    }).error(function(err){
        email.sendApiErrorEmail(err);
        socket.emit("updatedGroup", "error");
    });
}

module.exports.updateGroupProfilePic = function (groupId, statusMessage, profilePic, socket) {
    let params = {
        Bucket: 'chatster-groups',
        Key: `groups/${groupId}.jpg`,
        Body: new Buffer(profilePic, 'base64'),
        ContentEncoding: 'base64',
        ContentType: 'image/jpg'
    };
    s3.putObject(params, function(err, data) {
        if (err) {
            socket.emit("updatedGroup", "error");
            email.sendApiErrorEmail(err);
        }else{
            var profilePicUrl = `//d1qwpseiflwh2l.cloudfront.net/${params.Key}`;
            updateGroupPicAndStatus(groupId, statusMessage, profilePicUrl, socket);
        }
    });
};

/**
 *  Updates user is allowed to unsend
 *
 * (userId int): id of the user of who is allowing their contact to unsend messages
 * (contactId int): id of the contact to whom the user is allowing to unsend messages
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.updateUserIsAllowedToUnsend = function (userId, contactId, socket){
    sequelize.query('CALL UpdateContactIsAllowedToUnsend(?,?)',
    { replacements: [ userId, contactId ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             socket.emit("updatedUnsend", "success");
    }).error(function(err){
        email.sendApiErrorEmail(err);
        socket.emit("updatedUnsend", "error");
    });
};


/**
 *  Updates user is not allowed to unsend
 *
 * (userId int): id of the user of who is not allowing their contact to unsend messages
 * (contactId int): id of the contact to whom the user is not allowing to unsend messages
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.updateUserIsNotAllowedToUnsend = function (userId, contactId, socket){
    sequelize.query('CALL UpdateContactIsNotAllowedToUnsend(?,?)',
    { replacements: [ userId, contactId ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             socket.emit("updatedUnsend", "success");
    }).error(function(err){
        email.sendApiErrorEmail(err);
        socket.emit("updatedUnsend", "error");
    });
};


/**
 *  Removes user from this group
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.exitGroupChat = function (req, res){
    sequelize.query('CALL ExitGroupChat(?,?)',
    { replacements: [ req.query.groupChatId, req.query.userId ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             res.json("Left group.");
    }).error(function(err){
        email.sendApiErrorEmail(err);
        res.json("Something went wrong. Try again later.");
    });
};


/**
 *  Deletes group chat invitatin
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.deleteGroupChatInvitation = function (req, res){
    sequelize.query('CALL DeleteGroupChatInvitation(?,?)',
    { replacements: [ req.query.userId, req.query.groupChatId ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             res.json("success");
    }).error(function(err){
        email.sendApiErrorEmail(err);
        res.json("Something went wrong. Try again later.");
    });
};


/**
 *  Retrieves the latest contacts information
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.getContactLatest = function (req,res){
    var latestContacts = [];
    if(req.query.contacts !== null && req.query.contacts !== 'undefined'){
        sequelize.query('CALL GetUsersWithIdIn(?)',
        { replacements: [ req.query.contacts.toString() ],
             type: sequelize.QueryTypes.RAW }).then(result => {
                 if(result.length > 0){
                    for (var i = 0; i < result.length; i++) {
                        var latestContact = {
                            _id: result[i].user_id,
                            name: result[i].user_name,
                            statusMessage: result[i].user_status_message,
                            profilePic: result[i].user_profile_pic
                        };
                        latestContacts.push(latestContact);
                    }
                    res.json(latestContacts);
                }else{
                    res.json(latestContacts);
                }
        }).error(function(err){
            email.sendApiErrorEmail(err);
            res.json(latestContacts);
        });
    }else{
        res.json(latestContacts); 
    }
};

/**
 *  Stores default img for each new group
 *
 * (req Object): object that holds all the request information
 * (data String): base64 encoded String holding the image
 * (groupMembers Array): array holding all the group members
 * (res Object): object that is used to send user response
 * (invitedGroupMembers Array): array holding all the group members except the admin
 * (groupChatCallback function): function that will be called upon successfull saving of the image
 */
function saveGroupDefaultProfilePic(req, data, groupMembers, res, invitedGroupMembers, groupChatCallback) {
    let params = {
        Bucket: 'chatster-groups',
        Key: `groups/${req.query.groupChatId}.jpg`,
        Body: new Buffer(data, 'base64'),
        ContentEncoding: 'base64',
        ContentType: 'image/jpg'
    };
    s3.putObject(params, function(err, data) {
        if (!err) {
            groupChatCallback(req, groupMembers, `//d1qwpseiflwh2l.cloudfront.net/${params.Key}`, res, invitedGroupMembers);
        } else {
            email.sendApiErrorEmail(err);
            res.json(null);
        }
    });
}

/**
 *  Retrieves the latest contacts information
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.createGroupChat = function (req, res) {
    var groupMembers = [];
    var invitedGroupMembers = [];
    for (var i = 0; i < req.query.invitedGroupChatMembers.length; i++) {
        groupMembers.push(req.query.invitedGroupChatMembers[i]);
        invitedGroupMembers.push(req.query.invitedGroupChatMembers[i]);
    }
    groupMembers.push(req.query.adminId);
    var bitmap = fs.readFileSync(config.path.groupDefaultProfilePicLocalPath);
    // convert binary data to base64 encoded string
    var data = new Buffer(bitmap).toString('base64');
    // create new group dir and store default group profile pic
    saveGroupDefaultProfilePic(req, data, groupMembers, res, invitedGroupMembers, groupChatCallback);
};

/**
 *  Saves new group chat inot database
 *
 * (req Object): object that holds all the request information
 * (groupMembers Array): array holding all the group members
 * (groupProfilePicS3URL String): URL to the group profile image
 * (res Object): object that is used to send user response
 * (invitedGroupMembers Array): array holding all the group members except the admin
 */
function groupChatCallback(req, groupMembers, groupProfilePicS3URL, res, invitedGroupMembers) {
    var myutc = time.getCurrentUTC();
    sequelize.query('CALL SaveNewGroupChat(?,?,?,?,?,?,?)',
    { replacements: [ req.query.groupChatId, req.query.adminId, req.query.groupChatName, "Group info.", groupProfilePicS3URL, myutc, groupMembers.toString() ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             var groupChat = {
                _id: req.query.groupChatId,
                groupChatAdminId: parseInt(req.query.adminId),
                groupChatMembers: groupMembers,
                groupChatName: req.query.groupChatName,
                groupChatStatusMessage: "Group info.",
                groupChatImage: groupProfilePicS3URL
            };
            var firebaseGroupChatInvitation = {
                receiver_ids: invitedGroupMembers
            };
            groupChatInvitationsRef.child(req.query.groupChatId).set(firebaseGroupChatInvitation);
            // send the response object in json
            res.json(groupChat);
    }).error(function(err){
        email.sendApiErrorEmail(err);
        res.json(null);
    });
}


/**
 *  Adds new member to an existing group chat
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.addNewMembersToGroupChat = function (req, res) {
    var myutc = time.getCurrentUTC();
    var tmpNewMembers = [];
    if (req.query.newMembers.length === 1) {
        tmpNewMembers.push(req.query.newMembers);
    } else if (req.query.newMembers.length > 1) {
        for (var m = 0; m < req.query.newMembers.length; m++) {
            tmpNewMembers.push(req.query.newMembers[m]);
        }
    }
    sequelize.query('CALL AddNewGroupChatMembers(?,?,?,?)',
    { replacements: [ req.query.groupChatId, tmpNewMembers.toString(), req.query.groupChatAdmin, myutc  ],
         type: sequelize.QueryTypes.RAW }).then(result => {
            var firebaseGroupChatInvitation = {
                receiver_ids: tmpNewMembers
            };
            groupChatInvitationsRef.child(req.query.groupChatId).set(firebaseGroupChatInvitation);
             res.json("New members added to the group."); 
    }).error(function(err){
        email.sendApiErrorEmail(err);
        res.json("Something went wrong, try again later.");
    });
};


/**
 *  Adds new member to an existing group chat
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.verifyPhone = function (req,res){
    sequelize.query('CALL GetUserById(?)',
    { replacements: [ req.query.phoneToVerify.toString() ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             if(result.length > 0){
                var existingUserName = result[0].user_name;
                var existingUserStatusMessage = result[0].user_status_message;
                var existingUserProfilePic = result[0].user_profile_pic;
                var chatsterContacts = [];
                sequelize.query('CALL GetUsersWithIdIn(?)',
                { replacements: [ req.query.contacts.toString() ],
                     type: sequelize.QueryTypes.RAW }).then(result => {
                         if(result.length > 0){
                            for (var i = 0; i < result.length; i++) {
                                chatsterContacts.push(parseInt(result[i].user_id));
                            }
                        }
                        var confirmPhoneResponse = {
                            _id: parseInt(req.query.phoneToVerify),
                            name: existingUserName,
                            profilePic: existingUserProfilePic,
                            statusMessage: existingUserStatusMessage,
                            chatsterContacts: chatsterContacts,
                            userAlreadyExists: true,
                            status: "success"
                        };
                        // send the response object in json
                        res.json(confirmPhoneResponse);
                }).error(function(err){
                    email.sendApiErrorEmail(err);
                    res.json(null);
                });
            }else{
                // user does not exist yet
                var confirmPhoneResponse = {
                    _id: parseInt(req.query.phoneToVerify),
                    name: "none",
                    profilePic: "none",
                    statusMessage: "none",
                    chatsterContacts: [0],
                    userAlreadyExists: false,
                    status: "success"
                };
                // send the response object in json
                res.json(confirmPhoneResponse);
            }
    }).error(function(err){
        email.sendApiErrorEmail(err);
        res.json(null);
    });
};

/**
 *  Processes resending 1-to-1 chat message
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.resendChatMessage = function (req, res){
        // get message created time in utc
        var myutc = time.getCurrentUTC();
        var message = "";
        if (req.query.contentType === "text") {
            message = req.query.message;
            processResendMessage(req, message, myutc, res, null);
        }
    
        if (req.query.contentType === "image") {
            uploadImageMessage(req, res, function(err) {
                if (err) {
                    email.sendApiErrorEmail(err);
                } else {
                    message = fs.readFileSync(req.file.path, 'base64');
                    processResendMessage(req, message, myutc, res, req.file.path);
                }
            })
        }
};


function processResendMessage(req, message, myutc, res, imgPath) {
    var resendMessageSuccessResponse = {
        uuid: req.query.uuid,
        response: "success"
    };
    var resendMessageErrorResponse = {
        uuid: req.query.uuid,
        response: "error"
    };

    sequelize.query('CALL InsertNewOfflineMessage(?,?,?,?,?,?,?,?,?)',
    { replacements: [ "chatMsg", req.query.contentType, req.query.senderId, req.query.receiverId, req.query.chatName, message, req.query.uuid, req.query.contactPublicKeyUUID, myutc ],
        type: sequelize.QueryTypes.RAW }).then(result => {
            sequelize.query('CALL DeleteOneTimePublicKeysByUUID(?,?)',
            { replacements: [ req.query.contactPublicKeyUUID, req.query.userPublicKeyUUID ],
                type: sequelize.QueryTypes.RAW }).then(result => {
                    var firebaseOfflineMessage = {
                        receiver_id: req.query.receiverId
                    };
                    offlineMessagesRef.child(req.query.uuid).set(firebaseOfflineMessage);
                    if (imgPath !== null) {
                        var fullPath = '/opt/chatster_backend/chatster_api/'+imgPath;
                        fs.unlink(fullPath, function(error) {
                            if (error) {
                                email.sendApiErrorEmail(err);
                                res.json(resendMessageErrorResponse);
                            }
                            res.json(resendMessageSuccessResponse);
                        });
                    }else{
                        res.json(resendMessageSuccessResponse);
                    }
            }).error(function(err){
                email.sendChatErrorEmail(err);
                res.json(resendMessageErrorResponse);
            });
    }).error(function(err){
        email.sendChatErrorEmail(err);
        res.json(resendMessageErrorResponse);
    });
}


/**
 *  Updates users Firebase messaging token
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.updateUserMessagingToken = function (req, res){
    if (req.query.userId !== null && req.query.messagingToken !== null) {
        usersRef.child(req.query.userId).child("messaging_token").set(req.query.messagingToken);
        res.json("doneUpdatingToken");
    } else {
        res.json("UpdatingTokenWrongValues");
    }
};


/**
 *  Updates users Firebase messaging token
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.resendGroupChatMessage = function (req,res){
    // Convert the strigified json containing all encrypted group message objects to json
    var groupChatOfflineMessages = JSON.parse(req.query.messages);
    var uuid = groupChatOfflineMessages.groupChatOfflineMessages[0].message_uuid;
    var groupChatId = groupChatOfflineMessages.groupChatOfflineMessages[0].group_chat_id;
    // get message created time in utc
    var myutc = time.getCurrentUTC();
    var resendGroupMessageErrorResponse = {
        uuid: uuid,
        response: "error",
        groupChatId: groupChatId
    };
    var resendGroupMessageSuccessResponse = {
        uuid: uuid,
        response: "success",
        groupChatId: groupChatId
    };
    
    var allPBKUUIDS = [];
    allPBKUUIDS.push(req.query.senderPublicKeyUUID);

    var groupChatMembers = [];

    for(var i = 0; i < groupChatOfflineMessages.groupChatOfflineMessages.length; i++){
        allPBKUUIDS.push(groupChatOfflineMessages.groupChatOfflineMessages[i].group_member_one_time_pbk_uuid);
        groupChatMembers.push(groupChatOfflineMessages.groupChatOfflineMessages[i].receiver_id);
    }

    GroupChatOfflineMessage.bulkCreate(groupChatOfflineMessages.groupChatOfflineMessages, { fields: ['msg_type', 'content_type', 'sender_id', 'receiver_id', 'group_chat_id', 'message', 'message_uuid', 'group_member_one_time_pbk_uuid', 'item_created'] }).then(() => {
        sequelize.query('CALL DeleteGroupOneTimePublicKeysByUUID(?)',
        { replacements: [ allPBKUUIDS.toString() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                var firebaseGroupOfflineMessage = {
                    receiver_ids: groupChatMembers
                };
                groupOfflineMessagesRef.child(uuid).set(firebaseGroupOfflineMessage);
                res.json(resendGroupMessageSuccessResponse);
        }).error(function(err){
            email.sendApiErrorEmail(err);
            res.json(resendGroupMessageErrorResponse);
        });
    }).error(function(err){
        email.sendApiErrorEmail(err);
        res.json(resendGroupMessageErrorResponse);
    });
};


/**
 *  Sends user an email with an invitation to join Chatster
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.inviteUser = function (req, res){
    email.inviteUser(req,res);
};



/**
 *  Not cooool, I know ;)               
 * if (req.query.contentType === "image") {
        uploadGroupImageMessage(req, res, function(err) {
            if (err) {
                email.sendApiErrorEmail(err);
            } else {
                message = fs.readFileSync(req.file.path, 'base64');
                processResendGroupMessage(req, groupChatMembers, myutc, res, message, req.file.path);
            }
        })
    }
 */