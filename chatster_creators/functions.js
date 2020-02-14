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
    databaseURL: 'https://chatster-58f6f.firebaseio.com'
});
var db = admin.database();
var ref = db.ref();
var creatorPostsRef = ref.child('creator_posts');
var creatorPostLikesRef = ref.child('creator_post_likes');
var creatorPostUnLikesRef = ref.child('creator_post_unlikes');
var creatorFollowsRef = ref.child('creator_follows');
var creatorPostCommentsRef = ref.child('creator_post_comments');
var creatorUnFollowsRef = ref.child('creator_unfollows');
var rn = require('random-number');
var gen = rn.generator({
    min: 1000,
    max: 9999,
    integer: true
});
var contentType = require('content-type');
var fileType = require('file-type');
var multer = require('multer');
const uploadVideoPost = multer({
    dest: 'videos/',
    limits: { fileSize: 10000000, files: 1 },
    fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(mp4)$/)) {
            return callback(new Error('Only MP4 Videos are allowed !'), false)
        }
        callback(null, true);
    }
}).single('video');


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
 *  Stores creators text post
 *
 * (userName String): creators user name
 * (postCapture String): text that appears under the post
 * (creatorProfilePic String): String that holds the URL of profile image of creator
 * (post String): post text
 * (postUUID String): uuid of the post
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.saveCreatorTextPost = function (userName, postCapture, postType, creatorProfilePic, postText, postUUID, socket) {
    var myutc = time.getCurrentUTC();
    var myutcForPostName = myutc.replace(' ', '_');
    myutcForPostName = myutcForPostName.replace('-', '_');
    myutcForPostName = myutcForPostName.replace('-', '_');
    myutcForPostName = myutcForPostName.replace(':', '_');
    myutcForPostName = myutcForPostName.replace(':', '_');


    sequelize.query('CALL ProcessNewCreatorTextPost(?,?,?,?,?,?,?,?,?,?,?)',
    { replacements: [ postUUID, userName, postCapture, postType, postText, 0, 0, myutc, myutc, "post", userName+" uploaded new post." ],
        type: sequelize.QueryTypes.RAW }).then(result => {
            if(result.length > 0){
                var receiver_ids = [];
                for(var i = 0; i < result.length; i++){
                    receiver_ids.push(result[i].follower_id);
                }
                // save post reference to firebase to trigger cloud function
                var firebaseCreatorPost = {
                    receiver_ids: receiver_ids
                };
                creatorPostsRef.child(postUUID).set(firebaseCreatorPost);
            }
            socket.emit("saveCreatorTextPost","success");
    }).error(function(err){
        email.sendCreatorsErrorEmail(err);
        socket.emit("saveCreatorTextPost","error");
    });
  };


/**
 *  Stores creators image post
 *
 * (userName String): creators user name
 * (postCapture String): text that appears under the post
 * (creatorProfilePic String): String that holds the URL of profile image of creator
 * (post String): base64 encoded String that holds the image
 * (postUUID String): uuid of the post
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.saveCreatorPost = function (userName, postCapture, postType, creatorProfilePic, post, postUUID, socket) {
  var myutc = time.getCurrentUTC();
  var myutcForPostName = myutc.replace(' ', '_');
  myutcForPostName = myutcForPostName.replace('-', '_');
  myutcForPostName = myutcForPostName.replace('-', '_');
  myutcForPostName = myutcForPostName.replace(':', '_');
  myutcForPostName = myutcForPostName.replace(':', '_');
  var postName = myutcForPostName.concat('_').concat(userName);
  let params = {
      Bucket: 'chatster-creator-posts',
      Key: `${userName}/${postName}.jpg`,
      Body: new Buffer(post, 'base64'),
      ContentEncoding: 'base64',
      ContentType: 'image/jpg'
  };

  var postUrl = "";
  s3.putObject(params, function(err, data) {
      if (!err) {
          postUrl = `//d1rtocr1p2vc61.cloudfront.net/${params.Key}`;
          sequelize.query('CALL ProcessNewCreatorPost(?,?,?,?,?,?,?,?,?,?,?)',
          { replacements: [ postUUID, userName, postCapture, postType, 0, 0, myutc, myutc, "post", userName+" uploaded new post.", postUrl ],
              type: sequelize.QueryTypes.RAW }).then(result => {
                  if(result.length > 0){
                      var receiver_ids = [];
                      for(var i = 0; i < result.length; i++){
                          receiver_ids.push(result[i].follower_id);
                      }
                      // save post reference to firebase to trigger cloud function
                      var firebaseCreatorPost = {
                          receiver_ids: receiver_ids
                      };
                      creatorPostsRef.child(postUUID).set(firebaseCreatorPost);
                  }
                  socket.emit("saveCreatorPost","success");
          }).error(function(err){
              email.sendCreatorsErrorEmail(err);
              socket.emit("saveCreatorPost","error");
          });
      } else {
          email.sendCreatorsErrorEmail(err);
          // emit error event to the creator
          socket.emit("saveCreatorPost","error");
      }
  });
};

/**
 *  Updates creators post
 *
 * (userName String): creators user name
 * (postCapture String): text that appears under the post
 * (creatorProfilePic String): String that holds the URL of profile image of creator
 * (post String): base64 encoded String that holds the image
 * (postUUID String): uuid of the post
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.updateCreatorPost = function (userName, postCapture, creatorProfilePic, post, postUUID, socket) {
  var myutc = time.getCurrentUTC();
  var postName = myutc.concat('_').concat(userId);
  let params = {
      Bucket: 'chatster-creator-posts',
      Key: `${userName}/${postName}.jpg`,
      Body: new Buffer(post, 'base64'),
      ContentEncoding: 'base64',
      ContentType: 'image/jpg'
  };
  s3.putObject(params, function(err, data) {
      if (!err) {
          // `//s3-us-west-2.amazonaws.com/chatster-creator-posts/${params.Key}`
          // update creators post in db
          // emit success event to the creator
      } else {
          email.sendCreatorsErrorEmail(err);
          // // emit error event to the creator
      }
  });
};


/**
 *  Likes creators post
 *
 * (userName String): creators user name
 * (postUUID String): uuid of the post
 * (userProfilePicUrl String): String that holds the URL of profile image of the user who likes this post
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.likeCreatorPost = function (userName, postUUID, userProfilePicUrl, socket) {
  var myutc = time.getCurrentUTC();
  var updatePostLikesStatusErrorMsg = {
      uuid: postUUID,
      status: "error",
      updatedLikes: 0//this needs to be not sent
  };
  var updatePostLikesStatusSuccessMsg = {
      uuid: postUUID,
      status: "success",
      updatedLikes: 0//this needs to be not sent
  };

  sequelize.query('CALL ProcessNewCreatorPostLike(?,?,?,?,?)',
  { replacements: [ postUUID, userName, myutc, "postLike", userName+" liked your post." ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              // save post like reference to firebase to trigger cloud function
              var firebaseCreatorPostLike = {
                  creator_id: result[0].user_id
              };
              var code = gen();
              var postLikeRef = postUUID+result[0].user_name+code;
              creatorPostLikesRef.child(postLikeRef).set(firebaseCreatorPostLike);
              socket.emit("likeCreatorPost", updatePostLikesStatusSuccessMsg);
          }
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      socket.emit("likeCreatorPost", updatePostLikesStatusErrorMsg);
  });
};


/**
 *  Unlikes creators post
 *
 * (userName String): creators user name
 * (postUUID String): uuid of the post
 * (userProfilePicUrl String): String that holds the URL of profile image of the user who unlikes this post
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.unlikeCreatorPost = function (userName, postUUID, userProfilePicUrl, socket) {
  var myutc = time.getCurrentUTC();
  var updatePostUnLikesStatusErrorMsg = {
      uuid: postUUID,
      status: "error",
      updatedLikes: 0//this needs to be not sent
  };
  var updatePostUnLikesStatusSuccessMsg = {
      uuid: postUUID,
      status: "success",
      updatedLikes: 0//this needs to be not sent
  };

  sequelize.query('CALL ProcessNewCreatorPostDisLike(?,?,?,?,?)',
  { replacements: [ postUUID, userName, myutc, "postUnlike", userName+" unliked your post." ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              var firebaseCreatorPostUnLike = {
                  creator_id: result[0].user_id
              };
              var code = gen();
              var postUnLikeRef = postUUID+result[0].user_name+code;
              creatorPostUnLikesRef.child(postUnLikeRef).set(firebaseCreatorPostUnLike);
              socket.emit("unlikeCreatorPost", updatePostUnLikesStatusSuccessMsg);
          }
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      socket.emit("unlikeCreatorPost", updatePostUnLikesStatusErrorMsg);
  });
};


/**
 *  Saves comment on creators post
 *
 * (userName String): creators user name
 * (userProfilePicUrl String): String that holds the URL of profile image of the user who comments on this post
 * (postUUID String): uuid of the post
 * (comment String): comment for the post
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.postCommentForCreatorPost = function (userName, userProfilePicUrl, postUUID, comment, socket) {
  var myutc = time.getCurrentUTC();
  sequelize.query('CALL ProcessNewCreatorPostComment(?,?,?,?,?,?,?)',
  { replacements: [ postUUID, userName, comment, myutc, myutc,"postComment", userName+" wrote this comment for your post: " + comment ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              var firebaseCreatorPostComment = {
                  creator_id: result[0].user_id
              };
              var code = gen();
              var creatorPostCommentRef = postUUID+userName+code;
              creatorPostCommentsRef.child(creatorPostCommentRef).set(firebaseCreatorPostComment);
              socket.emit("postCommentForCreatorPost","success");
          }
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      socket.emit("postCommentForCreatorPost","error");
  });
};


/**
 *  Deletes creators post
 *
 * (postUUID String): uuid of the post
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.deleteCreatorPost = function (postUUID, socket) {
  // delete post with id from db
  // notify user of success failure
  var deleteResponseError = {
      uuid: postUUID,
      status: "error"
  };
  var deleteResponseSuccess = {
      uuid: postUUID,
      status: "success"
  };
  
  console.log(postUUID);

  sequelize.query('CALL DeleteCreatorPost(?)',
  { replacements: [ postUUID ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          socket.emit("deleteCreatorPost",deleteResponseSuccess);
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      socket.emit("deleteCreatorPost",deleteResponseError);
  });
};


/**
 *  Connects this creator another with creator
 *
 * (userId String): userId of creator who wants to connect with another creator
 * (userName String): user name of creator who wants to connect with another creator
 * (photoUrl String): user profile picture URL of creator who wants to connect with another creator
 * (creatorName String): creator name of creator with whom this user wants to connect
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.connectWithCreator = function (userId, userName, photoUrl, creatorName, socket) {
  var myutc = time.getCurrentUTC();
  var creator_id = "";
  var followResponseError = {
      creatorsName: creatorName,
      status: "error"
  };
  var followResponseSuccess = {
      creatorsName: creatorName,
      status: "success"
  };

  sequelize.query('CALL ProcessNewCreatorFollower(?,?,?,?,?)',
  { replacements: [ userId.toString(), creatorName, "follow", userName+" is following you.", myutc ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              var firebaseCreatorFollow = {
                  creator_id: result[0].user_id
              };
              var code = gen();
              var creatorFollowRef = userId+result[0].user_name+code;
              creatorFollowsRef.child(creatorFollowRef).set(firebaseCreatorFollow);
              socket.emit("connectWithCreator",followResponseSuccess);
          }
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      socket.emit("connectWithCreator",followResponseError);
  });
};


/**
 *  Disconnects from this creator
 *
 * (userId String): userId of creator who wants to disconnect with another creator
 * (userName String): user name of creator who wants to disconnect with another creator
 * (photoUrl String): user profile picture URL of creator who wants to disconnect with another creator
 * (creatorName String): creator name of creator with whom this user wants to disconnect
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.disconnectWithCreator = function (userId, userName, photoUrl, creatorName, socket) {
  var myutc = time.getCurrentUTC();
  var unfollowResponseError = {
      creatorsName: creatorName,
      status: "error"
  };
  var unfollowResponseSuccess = {
      creatorsName: creatorName,
      status: "success"
  };
  
  sequelize.query('CALL ProcessDeleteCreatorFollower(?,?,?,?,?)',
  { replacements: [ userId.toString(), creatorName, "unfollow", userName+" has unfollowed you.", myutc ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              var firebaseCreatorUnFollow = {
                  creator_id: result[0].user_id
              };
              var code = gen();
              var creatorUnFollowRef = userId+creatorName+code;
              creatorUnFollowsRef.child(creatorUnFollowRef).set(firebaseCreatorUnFollow);
              socket.emit("disconnectWithCreator",unfollowResponseSuccess);
          }
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      socket.emit("disconnectWithCreator",unfollowResponseError);
  });
};


/**
 *  Searches for creator who's name starts with
 *
 * (userId String): userId of creator who searches for another creator
 * (name String): creator name of creator for whom this user searches
 * (socket Object): Socket.IO object that is used to send user response
 */
module.exports.searchForCreator = function (userId, name, socket) {
  var searchResultCreators = [];
  sequelize.query('CALL GetUserWithNameStartsWith(?,?)',
  { replacements: [ name, userId.toString() ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              for (var i = 0; i < result.length; i++) {
                  var creator = {
                      creatorId: result[i].user_name,
                      statusMessage: result[i].user_status_message,
                      profilePic: result[i].user_profile_pic,
                      posts: result[i].user_posts,
                      creatorFollowers: 0,// this value is not being displayed to the user
                      creatorFollowing: 0,// this value is not being displayed to the user
                      creatorProfileViews: result[i].user_creator_profile_views,
                      creatorTotalLikes: result[i].user_creator_total_likes,
                      website: result[i].user_creator_website,
                      followingThisCreator: 0// this value is not being displayed to the user
                  };
                  searchResultCreators.push(creator);
              }
          }
          socket.emit("searchForCreator", JSON.stringify(searchResultCreators));
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      socket.emit("searchForCreator", JSON.stringify(searchResultCreators));
  });
};

/**
 *  Retrieves latest 100 posts 
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.discoverPosts = function (req, res){
  var discoverPosts = [];
  var postUrls = [];
  sequelize.query('CALL GetDiscoverPosts( )',
  { replacements: [  ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              for(var i = 0; i < result.length; i++){
                  var next = i+1;
                  if(result.length > next){
                      if(result[i].post_uuid === result[next].post_uuid){
                          postUrls.push(result[i].post_url);
                      }else{
                          postUrls.push(result[i].post_url);
                          var creatorPost = {
                              uuid: result[i].post_uuid,
                              creatorProfilePicUrl: result[i].creator_profile_pic,
                              creatorsName: result[i].creator_name,
                              postUrls: postUrls,
                              postCaption: result[i].post_caption,
                              postType: result[i].post_type,
                              postText: result[i].post_text !== null ? result[i].post_text : result[i].post_type,
                              likes: result[i].likes,
                              comments: result[i].comments,
                              postCreated: result[i].item_created,
                              followingThisCreator: 0
                          };
                          discoverPosts.push(creatorPost);
                          postUrls = [];
                      }
                  }else{
                      postUrls.push(result[i].post_url);
                      var myCreatorPost = {
                          uuid: result[i].post_uuid,
                          creatorProfilePicUrl: result[i].creator_profile_pic,
                          creatorsName: result[i].creator_name,
                          postUrls: postUrls,
                          postCaption: result[i].post_caption,
                          postType: result[i].post_type,
                          postText: result[i].post_text !== null ? result[i].post_text : result[i].post_type,
                          likes: result[i].likes,
                          comments: result[i].comments,
                          postCreated: result[i].item_created,
                          followingThisCreator: 0
                      };
                      discoverPosts.push(myCreatorPost);
                      postUrls = [];
                  }
              }
          }
          res.json(discoverPosts);
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      res.json(discoverPosts);
  });
};

/**
 *  Retrieves latest 100 posts of creators who this user is following 
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.latestPosts = function (req, res){
  var latestPosts = [];
  var postUrls = [];
  sequelize.query('CALL GetLatestPosts(?,?)',
  { replacements: [ req.query.creator, req.query.creatorsName ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              for(var i = 0; i < result.length; i++){
                  var next = i+1;
                  if(result.length > next){
                      if(result[i].post_uuid === result[next].post_uuid){
                          postUrls.push(result[i].post_url);
                      }else{
                          postUrls.push(result[i].post_url);
                          var creatorPost = {
                              uuid: result[i].post_uuid,
                              creatorProfilePicUrl: result[i].creator_profile_pic,
                              creatorsName: result[i].creator_name,
                              postUrls: postUrls,
                              postCaption: result[i].post_caption,
                              postType: result[i].post_type,
                              postText: result[i].post_text !== null ? result[i].post_text : result[i].post_type,
                              likes: result[i].likes,
                              comments: result[i].comments,
                              postCreated: result[i].item_created,
                              followingThisCreator: 0
                          };
                          latestPosts.push(creatorPost);
                          postUrls = [];
                      }
                  }else{
                      postUrls.push(result[i].post_url);
                      var myCreatorPost = {
                          uuid: result[i].post_uuid,
                          creatorProfilePicUrl: result[i].creator_profile_pic,
                          creatorsName: result[i].creator_name,
                          postUrls: postUrls,
                          postCaption: result[i].post_caption,
                          postType: result[i].post_type,
                          postText: result[i].post_text !== null ? result[i].post_text : result[i].post_type,
                          likes: result[i].likes,
                          comments: result[i].comments,
                          postCreated: result[i].item_created,
                          followingThisCreator: 0
                      };
                      latestPosts.push(myCreatorPost);
                      postUrls = [];
                  }
              }
          }
          res.json(latestPosts);
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      res.json(latestPosts);
  });
};

/**
 * Sorts an array by date
 */
var sortBy = (function () {
    var toString = Object.prototype.toString,
        // default parser function
        parse = function (x) { return x; },
        // gets the item to be sorted
        getItem = function (x) {
          var isObject = x != null && typeof x === "object";
          var isProp = isObject && this.prop in x;
          return this.parser(isProp ? x[this.prop] : x);
        };
  
    /**
     * Sorts an array of elements.
     *
     * @param {Array} array: the collection to sort
     * @param {Object} cfg: the configuration options
     * @property {String}   cfg.prop: property name (if it is an Array of objects)
     * @property {Boolean}  cfg.desc: determines whether the sort is descending
     * @property {Function} cfg.parser: function to parse the items to expected type
     * @return {Array}
     */
    return function sortby (array, cfg) {
      if (!(array instanceof Array && array.length)) return [];
      if (toString.call(cfg) !== "[object Object]") cfg = {};
      if (typeof cfg.parser !== "function") cfg.parser = parse;
      cfg.desc = !!cfg.desc ? -1 : 1;
      return array.sort(function (a, b) {
        a = getItem.call(cfg, a);
        b = getItem.call(cfg, b);
        return cfg.desc * (a < b ? -1 : +(a > b));
      });
    };
  
  }());

/**
 *  Retrieves this users notification history 
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.creatorHistory = function (req, res){
  var creatorHistoryItems = [];
  sequelize.query('CALL GetNotificationHistory(?)',
  { replacements: [ req.query.userId ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              for(var i = 0; i < result.length; i++){
                  var creatorHistoryItem = {
                      userProfilePic: result[i].creator_profile_pic,
                      userName: result[i].user_name,
                      type: result[i].notification_type,
                      description: result[i].notification_description,
                      created: result[i].item_created,
                      postUUID: result[i].post_uuid,
                      postUrl: result[i].post_url
                  };
                  creatorHistoryItems.push(creatorHistoryItem);
              }
          }
          sequelize.query('CALL GetFollowNotificationHistory(?)',
          { replacements: [ req.query.userId ],
              type: sequelize.QueryTypes.RAW }).then(result => {
                  if(result.length > 0){
                      for(var j = 0; j < result.length; j++){
                          var creatorHistoryItem = {
                              userProfilePic: result[j].creator_profile_pic,
                              userName: result[j].user_name,
                              type: result[j].notification_type,
                              description: result[j].notification_description,
                              created: result[j].item_created,
                              postUUID: result[j].post_uuid,
                              postUrl: result[j].post_url
                          };
                          creatorHistoryItems.push(creatorHistoryItem);
                      }
                  }
                  res.json(sortBy(creatorHistoryItems, { prop: "created", desc: true }));
          }).error(function(err){
              email.sendCreatorsErrorEmail(err);
              res.json(sortBy(creatorHistoryItems, { prop: "created", desc: true }));
          });
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      res.json(creatorHistoryItems);
  });
};

/**
 *  Retrieves all comments for this post 
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.creatorPostComments = function (req, res){
  var creatorPostCommentsArr = [];
  sequelize.query('CALL GetPostComments(?)',
  { replacements: [ req.query.postUUID ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              for(var i = 0; i < result.length; i++){
                  var creatorPostComment = {
                      _id: result[i].item_id,
                      postUUID: result[i].post_uuid,
                      creatorsName: result[i].user_name,
                      userProfilePicUrl: result[i].creator_profile_pic,
                      comment: result[i].post_comment,
                      commentCreated: result[i].item_created
                  };
                  creatorPostCommentsArr.push(creatorPostComment);
              }
          }
          res.json(creatorPostCommentsArr);
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      res.json(creatorPostCommentsArr);
  });
};

/**
 *  Retrieves all data for this creator
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.creatorContactProfile = function (req, res){
  var creatorPostsArr = [];
  var postUrls = [];
  sequelize.query('CALL GetCreatorProfile(?,?)',
  { replacements: [ req.query.creatorName, req.query.userId ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              var creator = {
                  creatorId: result[0].user_name,
                  statusMessage: result[0].user_status_message,
                  profilePic: result[0].user_profile_pic,
                  posts: result[0].user_posts,
                  creatorFollowers: result[0].creator_total_followers,
                  creatorFollowing: result[0].creator_total_following,
                  creatorProfileViews: result[0].user_creator_profile_views,
                  creatorTotalLikes: result[0].user_creator_total_likes,
                  website: result[0].user_creator_website,
                  followingThisCreator: result[0].following_this_creator,
                  creatorPosts: []
              };
              if(result[0].post_uuid !== null){
                  for(var i = 0; i < result.length; i++){
                      var next = i+1;
                      if(result.length > next){
                          if(result[i].post_uuid === result[next].post_uuid){
                              postUrls.push(result[i].post_url);
                          }else{
                              postUrls.push(result[i].post_url);
                              var creatorPost = {
                                  uuid: result[i].post_uuid,
                                  creatorProfilePicUrl: result[0].user_profile_pic,
                                  creatorsName: result[i].creator_name,
                                  postUrls: postUrls,
                                  postCaption: result[i].post_caption,
                                  postType: result[i].post_type,
                                  postText: result[i].post_text !== null ? result[i].post_text : result[i].post_type,
                                  likes: result[i].likes,
                                  comments: result[i].comments,
                                  postCreated: result[i].item_created,
                                  followingThisCreator: 0
                              };
                              creatorPostsArr.push(creatorPost);
                              postUrls = [];
                          }
                      }else{
                          postUrls.push(result[i].post_url);
                          var myCreatorPost = {
                              uuid: result[i].post_uuid,
                              creatorProfilePicUrl: result[0].user_profile_pic,
                              creatorsName: result[i].creator_name,
                              postUrls: postUrls,
                              postCaption: result[i].post_caption,
                              postType: result[i].post_type,
                              postText: result[i].post_text !== null ? result[i].post_text : result[i].post_type,
                              likes: result[i].likes,
                              comments: result[i].comments,
                              postCreated: result[i].item_created,
                              followingThisCreator: 0
                          };
                          creatorPostsArr.push(myCreatorPost);
                          postUrls = [];
                      }
                  }
              }
              creator.creatorPosts = creatorPostsArr;
              res.json(creator);
          }else{
              res.json(null);
          } 
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      res.json(null);
  });
};

/**
 *  Retrieves all posts for this creator
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.creatorPosts = function (req, res){
  var creatorPostsArr = [];
  sequelize.query('CALL GetCreatorPosts(?)',
  { replacements: [ req.query.creatorsName ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              for(var i = 0; i < result.length; i++){
                  var next = i+1;
                  if(result.length > next){
                      if(result[i].post_uuid === result[next].post_uuid){
                          postUrls.push(result[i].post_url);
                      }else{
                          postUrls.push(result[i].post_url);
                          var creatorPost = {
                              uuid: result[i].post_uuid,
                              creatorProfilePicUrl: result[i].creator_profile_pic,
                              creatorsName: result[i].creator_name,
                              postUrls: postUrls,
                              postCaption: result[i].post_caption,
                              postType: result[i].post_type,
                              postText: result[i].post_text !== null ? result[i].post_text : result[i].post_type,
                              likes: result[i].likes,
                              comments: result[i].comments,
                              postCreated: result[i].item_created,
                              followingThisCreator: 0
                          };
                          creatorPostsArr.push(creatorPost);
                          postUrls = [];
                      }
                  }else{
                      postUrls.push(result[i].post_url);
                      var myCreatorPost = {
                          uuid: result[i].post_uuid,
                          creatorProfilePicUrl: result[i].creator_profile_pic,
                          creatorsName: result[i].creator_name,
                          postUrls: postUrls,
                          postCaption: result[i].post_caption,
                          postType: result[i].post_type,
                          postText: result[i].post_text !== null ? result[i].post_text : result[i].post_type,
                          likes: result[i].likes,
                          comments: result[i].comments,
                          postCreated: result[i].item_created,
                          followingThisCreator: 0
                      };
                      creatorPostsArr.push(myCreatorPost);
                      postUrls = [];
                  }
              }
          }
          res.json(creatorPostsArr);
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      res.json(creatorPostsArr);
  });
};

/**
 *  Retrieves more posts for this creator
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.loadMorePosts = function (req, res){
  var creatorPostsArr = [];
  sequelize.query('CALL LoadMoreCreatorPosts(?,?)',
  { replacements: [ req.query.creatorsName, req.query.lastPostCreated ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              for(var i = 0; i < result.length; i++){
                  var next = i+1;
                  if(result.length > next){
                      if(result[i].post_uuid === result[next].post_uuid){
                          postUrls.push(result[i].post_url);
                      }else{
                          postUrls.push(result[i].post_url);
                          var creatorPost = {
                              uuid: result[i].post_uuid,
                              creatorProfilePicUrl: result[i].creator_profile_pic,
                              creatorsName: result[i].creator_name,
                              postUrls: postUrls,
                              postCaption: result[i].post_caption,
                              postType: result[i].post_type,
                              postText: result[i].post_text !== null ? result[i].post_text : result[i].post_type,
                              likes: result[i].likes,
                              comments: result[i].comments,
                              postCreated: result[i].item_created,
                              followingThisCreator: 0
                          };
                          creatorPostsArr.push(creatorPost);
                          postUrls = [];
                      }
                  }else{
                      postUrls.push(result[i].post_url);
                      var myCreatorPost = {
                          uuid: result[i].post_uuid,
                          creatorProfilePicUrl: result[i].creator_profile_pic,
                          creatorsName: result[i].creator_name,
                          postUrls: postUrls,
                          postCaption: result[i].post_caption,
                          postType: result[i].post_type,
                          postText: result[i].post_text !== null ? result[i].post_text : result[i].post_type,
                          likes: result[i].likes,
                          comments: result[i].comments,
                          postCreated: result[i].item_created,
                          followingThisCreator: 0
                      };
                      creatorPostsArr.push(myCreatorPost);
                      postUrls = [];
                  }
              }
          }
          res.json(creatorPostsArr);
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      res.json(creatorPostsArr);
  });
};

/**
 *  Retrieves all creators who this user follows
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.creatorFollows = function (req, res){
  var creatorFollowsArr = [];
  sequelize.query('CALL GetCreatorFollows(?)',
  { replacements: [ req.query.userId ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              for(var i = 0; i < result.length; i++){
                  var creator = {
                      creatorId: result[i].user_name,
                      statusMessage: result[i].user_status_message,
                      profilePic: result[i].user_profile_pic,
                      posts: result[i].user_posts,
                      creatorFollowers: 0,
                      creatorFollowing: 0,
                      creatorProfileViews: result[i].user_creator_profile_views,
                      creatorTotalLikes: result[i].user_creator_total_likes,
                      website: result[i].user_creator_website,
                      followingThisCreator: 1// this value is not displayed to the user
                  };
                  creatorFollowsArr.push(creator);
              }
              res.json(creatorFollowsArr);
          }else{
              res.json(creatorFollowsArr);
          }  
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      res.json(creatorFollowsArr);
  });
};

/**
 *  Retrieves all followers for this user 
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.creatorFollowers = function (req, res){
  var creatorFollowersArr = [];
  sequelize.query('CALL GetCreatorFollowers(?)',
  { replacements: [ req.query.creatorName ],
      type: sequelize.QueryTypes.RAW }).then(result => {
          if(result.length > 0){
              for(var i = 0; i < result.length; i++){
                  var creator = {
                      creatorId: result[i].user_name,
                      statusMessage: result[i].user_status_message,
                      profilePic: result[i].user_profile_pic,
                      posts: result[i].user_posts,
                      creatorFollowers: 0,
                      creatorFollowing: 0,
                      creatorProfileViews: result[i].user_creator_profile_views,
                      creatorTotalLikes: result[i].user_creator_total_likes,
                      website: result[i].user_creator_website,
                      followingThisCreator: 0// this value is not displayed to the user
                  };
                  creatorFollowersArr.push(creator);
              }
              res.json(creatorFollowersArr);
          }else{
              res.json(creatorFollowersArr);
          }  
  }).error(function(err){
      email.sendCreatorsErrorEmail(err);
      res.json(creatorFollowersArr);
  });
};



/**
 *  Stores creators video post
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
function saveCreatorVideoPost(req, res) {
    // userName, postCapture, creatorProfilePic, post path, postUUID, postType
    fs.readFile(req.file.path, function (err, video) {
        if (err){
            email.sendCreatorsErrorEmail(err);
            res.json("error");
        }else{
            var myutc = time.getCurrentUTC();
            var myutcForPostName = myutc.replace(' ', '_');
            myutcForPostName = myutcForPostName.replace('-', '_');
            myutcForPostName = myutcForPostName.replace('-', '_');
            myutcForPostName = myutcForPostName.replace(':', '_');
            myutcForPostName = myutcForPostName.replace(':', '_');
            var postName = myutcForPostName.concat('_').concat(req.query.userName);
            let params = {
                Bucket: 'chatster-creator-posts',
                Key: `${req.query.userName}/${postName}.mp4`,
                Body: video,
                ContentType: 'video/mp4'
            };
            var postUrl = "";
            var receiver_ids = [];
            s3.putObject(params, function(err, data) {
                if (!err) {
                    postUrl = `//d1rtocr1p2vc61.cloudfront.net/${params.Key}`;
                    sequelize.query('CALL ProcessNewCreatorPost(?,?,?,?,?,?,?,?,?,?,?)',
                    { replacements: [ req.query.uuid, req.query.userName, req.query.postCapture, req.query.postType, 0, 0, myutc, myutc, "post", req.query.userName+" uploaded new post.", postUrl ],
                        type: sequelize.QueryTypes.RAW }).then(result => {
                            if(result.length > 0){
                                var receiver_ids = [];
                                for(var i = 0; i < result.length; i++){
                                    receiver_ids.push(result[i].follower_id);
                                }
                                // save post reference to firebase to trigger cloud function
                                var firebaseCreatorPost = {
                                    receiver_ids: receiver_ids
                                };
                                creatorPostsRef.child(req.query.uuid).set(firebaseCreatorPost);
                                res.json("success");
                                var fullPath = '/opt/chatster_backend/chatster_creators/'+req.file.path;
                                fs.unlink(fullPath, function(error) {
                                    if (error) {
                                        email.sendCreatorsErrorEmail(error);
                                    }
                                });
                            }else{
                                res.json("success"); 
                            }
                    }).error(function(err){
                        email.sendCreatorsErrorEmail(err);
                        res.json("error");
                    });
                } else {
                    email.sendCreatorsErrorEmail(err);
                    res.json("error");
                }
            });
        }
    });
  }


/**
 *  Uploads new video post to S3 and saves post data to db
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.uploadVideoPost = function (req, res){
    // userName, postCapture, creatorProfilePic, post, postUUID,
    uploadVideoPost(req, res, function(err) {
        if (err) {
            email.sendCreatorsErrorEmail(err);
            res.json("error");
        } else {
            saveCreatorVideoPost(req, res);
        }
    })
};
