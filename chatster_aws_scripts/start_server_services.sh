#!/bin/bash
sudo systemctl start chatster_api.service
sudo systemctl start chatster_creators.service
sudo systemctl start chatster_api_notifications.service
sudo systemctl start chatster_socketio_chat.service
sudo systemctl start chatster_socketio_group_chat.service