// General Utility modules
const path = require('path');
const fs = require("fs");
// For the HTTP server
const express = require("express");
const app = express();
const http = require('http').createServer(app);
// In-Memory Cache Storage
const redis = require('redis');
let RedisClient = redis.createClient({
    host: 'open360-redis-api-cache',
    port: 6379
});
// Socket for connecting to the internal API
const io = require("socket.io-client");

const Util = require("open360-util");

// Tell the server what port it should use. 8080 is for testing purposes
const PORT = parseInt(process.env.PORT) || 8080;

// Set up the parser for requests that are json type
app.use(require('body-parser').json('application/json'));

// SERVER RESPONSES

app.get("/", function (req, res) {
    CheckStatus()
        .then((data) => {
            res.status(200).json({status: data});
        });
});

app.get("/getChatStats", function (req, res) {
    let room = req.body.roomName;
    if (room == null || room == "") {
        res.status(400).json({message: "Bad Request"});
        return;
    }
    GetChatStats(room)
        .then((data) => {
            res.status(200).json({chatStats: data});
        });
});

app.get("/getStreamStatus", function (req, res) {
    let channelName = req.body.username;
    if (channelName == null || channelName == "") {
        res.status(400).json({message: "Bad Request"});
        return;
    }
    GetStreamStatus(channelName)
        .then((data) => {
            res.status(200).json({streamStatus: data.name, code: data.code});
        });
});

app.get("/getStreamStats", function (req, res) {
    let channelName = req.body.username;
    if (channelName == null || channelName == "") {
        res.status(400).json({message: "Bad Request"});
        return;
    }
    GetStreamStats(channelName)
        .then((data) => {
            res.status(200).json({data: data});
        });
});

// SERVER LISTEN

http.listen(PORT,function (){
    console.info("Express listening on *:" + PORT);
});

// ERROR HANDLING

RedisClient.on('error', function (e){
    if (e.code === 'ECONNREFUSED') {
        console.error("Redis could not connect to the local database, error bellow");
        console.error(e);
        process.exit(404);
        return;
    }
    console.error(e);
});

// CONNECT TO THE INTERNAL API

const socket = io("ws://open-360-api-sock:4000", {
    reconnectionDelayMax: 10000,
    query: {
        name: "open360:web-external-api-server"
    }
});

socket.on("connect", function (){
    console.log("Connected to Internal API");
    socket.emit("log",{log:"Connected to Internal API", type:"info"});
});

function CheckStatus() {
    return new Promise((resolve, reject) => {
        Util.api.sendQuestion(socket, "ingest-api", "web-external-api", {prompt: "status"});
        Util.api.sendQuestion(socket, "web-api", "web-external-api", {prompt: "status"});
        Util.api.sendQuestion(socket, "chat-api", "web-external-api", {prompt: "status"});

        let status = {};
        status.api = "alive";
        status.ingest = "dead";
        status.web = "dead";
        status.chat = "dead";

        socket.on("web-external-api", (data) => {
            if (data.ack == "ingest-api" && data.type == Util.api.APIMessageType.message && data.package.prompt == "status-reply") {
                status.ingest = data.package.status;
            }
            if (data.ack == "web-api" && data.type == Util.api.APIMessageType.message && data.package.prompt == "status-reply") {
                status.web = data.package.status;
            }
            if (data.ack == "chat-api" && data.type == Util.api.APIMessageType.message && data.package.prompt == "status-reply") {
                status.chat = data.package.status;
            }
        });

        setTimeout(function (){
            resolve(status);
        }, 1000);
    });
}

function GetStreamStatus(username) {
    return new Promise((resolve, reject) => {
        let pack = {
            prompt: "streamStatus",
            data: {username: username},
            message: "Checking Stream Status"
        }
        Util.api.sendQuestion(socket, "web-api", "web-external-api", pack);
        socket.on("web-external-api", (data) => {
            if (data.ack == "web-api" && data.type == Util.api.APIMessageType.message && data.package.prompt == "streamStatus-reply") {
                resolve(data.package.data);
            }
        });
    });
}

function GetStreamStats(username) {
    return new Promise((resolve, reject) => {
        GetChatStats(username)
            .then((chatData) => {
                let pack = {
                    prompt: "streamStats",
                    data: {username: username},
                    message: "Checking Stream Stats"
                }
                Util.api.sendQuestion(socket, "web-api", "web-external-api", pack);
                socket.on("web-external-api", (streamData) => {
                    if (streamData.ack == "web-api" && streamData.type == Util.api.APIMessageType.message && streamData.package.prompt == "streamStats-reply") {
                        let data = {...streamData.package.data, ...chatData};
                        resolve(data);
                    }
                });
            });
    });
}

function GetChatStats(roomName) {
    return new Promise((resolve, reject) => {
        let pack = {
            prompt: "roomStats",
            data: {room: roomName},
            message: "Checking Chat Stats"
        }
        Util.api.sendQuestion(socket, "chat-api", "web-external-api", pack);
        socket.on("web-external-api", (data) => {
            if (data.ack == "chat-api" && data.type == "message" && data.package.prompt == "roomStats-reply") {
                resolve(data.package.data);
            }
        });
    });
}

