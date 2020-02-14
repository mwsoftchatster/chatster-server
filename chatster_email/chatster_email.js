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
var nodemailer = require('nodemailer');
/**
 * setup the nodemailer
 * create reusable transporter object using the default SMTP transport
 * 
 */
let transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
        user: config.email.auth.user,
        pass: config.email.auth.pass
    }
});



/*
 * Sends email containing generated error
 * 
 */
module.exports.sendApiErrorEmail = function (error) {
  var mailOptions = {
      from: '"Chatster" SENDER_ADDRESS', // sender address
      to: 'RECEIVER_ADDRESS', // list of receivers
      subject: 'Chatster Api Error', // Subject line
      text: `Chatster Error`, // plain text body
      html: `<p>The following error has been generated:</p> <p>${error}</p>` // html body
  };
  // send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
          // console.log(error);
      }
  });
};


/*
 * Sends an email to notify of successfull startup of this service
 * 
 */
module.exports.sendNewApiIsUpEmail = function () {
  var mailOptions = {
      from: '"Chatster" SENDER_ADDRESS', // sender address
      to: 'RECEIVER_ADDRESS', // list of receivers
      subject: 'Chatster New Api Server Is Up', // Subject line
      text: `Chatster New Api Server Is Up`
  };
  // send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
          // console.log(error);
      }
  });
};


/*
 * Sends an email to notify of new user registration
 * 
 * (userId): int
 * (userName): String
 */
module.exports.sendNewUserRegisteredEmail = function (userId, userName) {
  var mailOptions = {
      from: '"Chatster" SENDER_ADDRESS', // sender address
      to: 'RECEIVER_ADDRESS', // list of receivers
      subject: 'Chatster New User Registered', // Subject line
      text: userName + ` Registered With Id => ` + userId
  };
  // send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
          // console.log(error);
      }
  });
};


 /*
 * Sends email containing generated error
 * 
 */
module.exports.sendCreatorsErrorEmail = function (error) {
  var mailOptions = {
      from: '"Chatster" SENDER_ADDRESS', // sender address
      to: 'RECEIVER_ADDRESS', // list of receivers
      subject: 'Chatster Creators Error', // Subject line
      text: `Chatster Error`, // plain text body
      html: `<p>The following error has been generated:</p> <p>${error}</p>` // html body
  };
  // send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
          // console.log(error);
      }
  });
};


 /*
 * Sends an email to notify of successfull startup of this service
 * 
 */
module.exports.sendNewCreatorsIsUpEmail = function () {
  var mailOptions = {
      from: '"Chatster" SENDER_ADDRESS', // sender address
      to: 'RECEIVER_ADDRESS', // list of receivers
      subject: 'Chatster New Creators Server Is Up', // Subject line
      text: `Chatster New Creators Server Is Up`
  };
  // send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
          // console.log(error);
      }
  });
};


 /*
 *  Sends an email containing generated 1-to-1 chat error
 * 
 */
module.exports.sendChatErrorEmail = function (error) {
    var mailOptions = {
        from: '"Chatster" SENDER_ADDRESS', // sender address
        to: 'RECEIVER_ADDRESS', // list of receivers
        subject: 'Chatster 1-to-1 Chat Error', // Subject line
        text: `Chatster Error`, // plain text body
        html: `<p>The following error has been generated:</p> <p>${error}</p>` // html body
    };
    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            // console.log(error);
        }
    });
};


 /*
 *  Sends an email to notify of successfull startup of this service
 * 
 */
module.exports.sendNewSocketChatIsUpEmail = function sendNewSocketChatIsUpEmail() {
    var mailOptions = {
        from: '"Chatster" SENDER_ADDRESS', // sender address
        to: 'RECEIVER_ADDRESS', // list of receivers
        subject: 'Chatster New Socket Chat Server Is Up', // Subject line
        text: `Chatster New Socket Chat Server Is Up`
    };
    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            // console.log(error);
        }
    });
};


 /*
 *  Sends an email containing generated group chat error
 * 
 */
module.exports.sendGroupChatErrorEmail = function (error) {
    var mailOptions = {
        from: '"Chatster" SENDER_ADDRESS', // sender address
        to: 'RECEIVER_ADDRESS', // list of receivers
        subject: 'Chatster Group Chat Error', // Subject line
        text: `Chatster Error`, // plain text body
        html: `<p>The following error has been generated:</p> <p>${error}</p>` // html body
    };
    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            // console.log(error);
        }
    });
};


 /*
 *  Sends an email to notify of successfull startup of this service
 * 
 */
module.exports.sendNewGroupChatIsUpEmail = function () {
    var mailOptions = {
        from: '"Chatster" SENDER_ADDRESS', // sender address
        to: 'RECEIVER_ADDRESS', // list of receivers
        subject: 'Chatster New Group Chat Server Is Up', // Subject line
        text: `Chatster New Group Chat Server Is Up`
    };
    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            // console.log(error);
        }
    });
};


 /*
 *  Sends an email containing generated notifications api error
 * 
 */
module.exports.sendNotificationsErrorEmail = function (error) {
    var mailOptions = {
        from: '"Chatster" SENDER_ADDRESS', // sender address
        to: 'RECEIVER_ADDRESS', // list of receivers
        subject: 'Chatster Api Notifications Error', // Subject line
        text: `Chatster Error`, // plain text body
        html: `<p>The following error has been generated:</p> <p>${error}</p>` // html body
    };
    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            // console.log(error);
        }
    });
};


 /*
 *  Sends an email to notify of successfull startup of this service
 * 
 */
module.exports.sendNewNotificationApiIsUpEmail = function () {
    var mailOptions = {
        from: '"Chatster" SENDER_ADDRESS', // sender address
        to: 'RECEIVER_ADDRESS', // list of receivers
        subject: 'Chatster New Notification Api Server Is Up', // Subject line
        text: `Chatster New Notification Api Server Is Up`
    };
    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            // console.log(error);
        }
    });
};



 /*
 *  Sends an email to invite user to join Chatster
 * 
 */
module.exports.inviteUser = function (req, res) {
    var mailOptions = {
        from: '"Chatster" SENDER_ADDRESS', // sender address
        to: req.query.inviteeEmail, // list of receivers
        subject: 'Join Chatster', // Subject line
        text: 'Hi ' + req.query.inviteeName + ', ' + req.query.userName + ` invites you to join Chatster. Click on this link to install Chatster -> https://play.google.com/store/apps/details?id=nl.mwsoft.www.chatster`
    };
    // send mail with defined transport object
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            res.json("error");
        }else{
            res.json("success");
        }
    });
};

