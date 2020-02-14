#!/bin/bash
sudo systemctl stop chatster_api.service
sudo systemctl stop chatster_creators.service
sudo systemctl stop chatster_api_notifications.service
sudo systemctl stop chatster_socketio_chat.service
sudo systemctl stop chatster_socketio_group_chat.service