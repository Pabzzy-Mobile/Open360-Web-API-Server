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

// Tell the server what port it should use. 8080 is for testing purposes
const PORT = parseInt(process.env.PORT) || 8080;

// Set up the parser for requests that are json type
app.use(require('body-parser').json('application/json'));

// SERVER RESPONSES

app.get("/", function (req, res) {
    CheckStatus()
        .then((data) => {
            res.status(200).json({API: data});
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
        socket.emit("api-message", {target: "ingest-api", ack: "web-external-api",type: "question", package: {prompt: "status"}});
        socket.emit("api-message", {target: "web-api", ack: "web-external-api",type: "question", package: {prompt: "status"}});
        socket.emit("api-message", {target: "chat-api", ack: "web-external-api",type: "question", package: {prompt: "status"}});

        let status = {};
        status.api = "alive";
        status.ingest = "dead";
        status.web = "dead";
        status.chat = "dead";

        socket.on("web-external-api", (data) => {
            if (data.ack == "ingest-api" && data.type == "message" && data.package.prompt == "status-reply") {
                status.ingest = data.package.status;
            }
            if (data.ack == "web-api" && data.type == "message" && data.package.prompt == "status-reply") {
                status.web = data.package.status;
            }
            if (data.ack == "chat-api" && data.type == "message" && data.package.prompt == "status-reply") {
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
        socket.emit("api-message", {
            target: "web-api",
            ack: "web-external-api",
            type: "question",
            package: {
                prompt: "streamStatus",
                data: {username: username},
                message: "Checking Stream Status"
            }
        });
        socket.on("web-external-api", (data) => {
            if (data.ack == "web-api" && data.type == "message" && data.package.prompt == "streamStatus-reply") {
                resolve(data.package.data);
            }
        });
    });
}

function GetStreamStats(username) {
    return new Promise((resolve, reject) => {
        socket.emit("api-message", {
            target: "web-api",
            ack: "web-external-api",
            type: "question",
            package: {
                prompt: "streamStats",
                data: {username: username},
                message: "Checking Stream Stats"
            }
        });
        socket.on("web-external-api", (streamData) => {
            if (streamData.ack == "web-api" && streamData.type == "message" && streamData.package.prompt == "streamStats-reply") {
                GetChatStats(username)
                    .then((chatData) => {
                        let data = {...streamData.package.data, ...chatData};
                        resolve(data);
                    });
            }
        });
    });
}

function GetChatStats(roomName) {
    return new Promise((resolve, reject) => {
        socket.emit("api-message", {
            target: "chat-api",
            ack: "web-external-api",
            type: "question",
            package: {
                prompt: "roomStats",
                data: {room: roomName},
                message: "Checking Chat Stats"
            }
        });
        socket.on("web-external-api", (data) => {
            if (data.ack == "chat-api" && data.type == "message" && data.package.prompt == "roomStats-reply") {
                resolve(data.package.data);
            }
        });
    });
}

