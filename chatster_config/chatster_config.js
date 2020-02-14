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
const config = {
    port: {
        api_port: 7000,
        chat_port: 3000,
        group_chat_port: 3500,
        api_notifications_port: 5500,
        creator_port: 7700,
        health_port: 2900
    },
    security: {
        key: '/opt/chatster_sec/chatsterkey.pem',
        cert: '/opt/chatster_sec/chatstercert.pem'
    },
    firebase: {
        service_account: '/opt/chatster_sec/FIREBASE_SERVICE_ACCOUNT',
        databaseURL: 'FIREBASE_DATABASE_URL'
    },
    path:{
        usersDirPath: '//AWS_S3_URL/chatster-users/users',
        userDefaultProfilePicPath: '//AWS_S3_URL/chatster-users/default/default.jpg',
        groupsDirPath: '//AWS_S3_URL/chatster-groups/groups',
        groupDefaultProfilePicPath: '//AWS_S3_URL/chatster-groups/default/default.jpg',
        userDefaultProfilePicLocalPath: '/opt/chatster_backend/chatster_users/default/default.jpg',
        groupDefaultProfilePicLocalPath: '/opt/chatster_backend/chatster_groups/default/default.jpg'
    },
    db: {
        name: 'DB_NAME', 
        user_name: 'DB_USER_NAME',
        password: 'DB_PASSWORD',
        host: 'DB_HOST',
        dialect: 'mysql',
        port: '3306',
        operatorsAliases: false,
        pool: {
            max: 1000,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    },
    email: {
        host: 'EMAIL_PROVIDER_URL',
        port: 587,
        secure: false,
        auth: {
            user: 'EMAIL_PROVIDER_USER',
            pass: 'EMAIL_PROVIDER_PASSWORD'
        }
    },
    rabbitmq: {
        url: "RABBITMQ_CONNECTION_URL"
    }
   };

   module.exports = config;