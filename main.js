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

// SERVER RESPONSES

app.get("/", function (req, res) {
    CheckStatus()
        .then((data) => {
            res.status(200).json({API: "alive"});
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
        name: "open360:web-api-server"
    }
});

socket.on("connect", function (){
    console.log("Connected to Internal API");
    socket.emit("log",{log:"Connected to Internal API", type:"info"});
});

function CheckStatus() {
    return new Promise((resolve, reject) => {
        socket.emit("api-message", {target: "ingest-api", ack: "web-external-api",type: "question", package: "status"});
        socket.on("web-external-api", (data) => {
            if (data.ack == "ingest-api" && data.type == "message") {
                resolve(data);
            }
        });
    });
}

