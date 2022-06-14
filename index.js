

/* imports */
const path = require('path');
const http = require('http');
const express = require('express');
const axios = require('axios')
const bodyParser = require("body-parser");
const socketio = require('socket.io');
const formatMessage = require('./helpers/formatDate')
const {
  getActiveUser,
  exitRoom,
  newUser,
  getIndividualRoomUsers
} = require('./helpers/userHelper');


const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Set public directory
app.use(express.static(path.join(__dirname, 'public')));

// configure the app to use bodyParser()
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

/* Variables */
const servername = "Server";
var ControlRoomURL= "http://ec2-3-6-118-186.ap-south-1.compute.amazonaws.com/";
var authToken = "";
var usercredentails = {
  username : "skoorma",
  password : 'password'
};
var botID = 7316;
var userId =181;
var deploymentId='';


/* functions */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


async function authentication(input){
  var url = ControlRoomURL+'v1/authentication';
  const data = {
    "username": usercredentails.username,
    "password": usercredentails.password
  }

  return axios
  .post(url, data)
  .then(res => {
    authToken = res?.data?.token;
    return  deployBot(authToken,input).then(res=>{
      return res;
    })
  })
  .catch(error => {
    console.error(error)
    return error;
  })
}



async function deployBot( authToken,input){
    var url = ControlRoomURL+'v3/automations/deploy';
    const data = 
    {
      "fileId": botID,  //id of the bot to execute
      "runAsUserIds": [
        userId //id(s) of the user account to run the bot - must have default device unless specified below
      ],
      "poolIds": [],
      "overrideDefaultDevice": false,
      "callbackInfo": {
        "url": "https://callbackserver.com/storeBotExecutionStatus", //Callback URL - not required, but can be used - can be removed if no callback needed
        "headers": {
          "X-Authorization": authToken //Callback API headers. Headers may contain authentication token, content type etc. Both key & value are of type string.
        }
      },
      "botInput": { //optional values to map to the bot...NOTE: These values must match the exact variable names and must be defined as input values
        "in_CustomerId": {
          "type": "STRING", //Type can be [ STRING, NUMBER, BOOLEAN, LIST, DICTIONARY, DATETIME ]
          "string": input?.split('Customer ID:')?.[1] //key must match type, in this case string
        }
      }
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Authorization': authToken
    }

  return  axios
    .post(url,data, {  headers: headers})
    .then(res => {
      deploymentId = res?.data?.deploymentId;
      return activityStatus(deploymentId).then(res=>{
        return res;
      })
     
    })
    .catch(error => {
      console.error(error)
      return error;
    })
}



async function activityStatus(deploymentId){
  var url = ControlRoomURL+'v2/activity/list';
  const data = {
      "filter": {
      "operator": "eq",
      "field": "deploymentId",
      "value": deploymentId
      },
      "sort": [
      {
      "field": "status",
      "direction": "asc"
      }
      ],
      "page": {
      "offset": 0,
      "length": 0
      }
    };

    const headers = {
      'Content-Type': 'application/json',
      'X-Authorization': authToken
    }

  return axios
  .post(url, data,{headers: headers})
  .then(async res => {
    var outputObj = res?.data?.list?.[0]; 
    var status = outputObj?.status;
    console.log(status);
    if(status == 'COMPLETED' || status == 'RUN_FAILED' ||status == 'RUN_ABORTED' || status =='RUN_TIMED_OUT' ||status == 'DEPLOY_FAILED' ||status == 'UNKNOWN'){
      if(status == 'COMPLETED'){
          var botOutput = outputObj?.botOutVariables?.values?.out_nRequestId?.number;
          io.to("Room").emit('message', formatMessage(servername, 'Please find the Request ID :  ' + botOutput));
      }else{
          io.to("Room").emit('message', formatMessage(servername, 'Something went wrong. Status:'+status));
      } 
    }else{
      await sleep(5000);
      activityStatus(deploymentId)
    }
  })
  .catch(error => {
    console.error(error)
    return error;
  })
}



/* Socket connection */

// this block will run when the client connects
io.on('connection', socket => {
  socket.on('joinRoom', ({ username, room }) => {
    const user = newUser(socket.id, username, room);

    socket.join(user.room);

   
    // General welcome
    //socket.emit('message', formatMessage(servername, 'Messages are limited to this room! '));
    socket.emit('message', formatMessage(servername, 'Welcome to AARI ChatBot. Submit your Credit Card requests here'));
    socket.emit('message', formatMessage(servername, 'Kindly provide your customer ID (eg: Customer ID: 2424324)'));
    // Broadcast everytime users connects
    socket.broadcast
      .to(user.room)
      .emit(
        'message',
        formatMessage(servername, `${user.username} has joined the room`)
      );

    // Current active users and room name
    io.to(user.room).emit('roomUsers', {
      room: user.room,
      users: getIndividualRoomUsers(user.room)
    });
  });


  
// app.post('/bot-response',(req,res)=>{
//   console.log(req.body);
//   res.send({Reply:req.body.status});
//   io.to("Room").emit('message', formatMessage(servername, 'Message from Bot : ' + JSON.stringify(req.body)));
// });


  // Listen for client message
  socket.on('chatMessage', msg => {
    const user = getActiveUser(socket.id);
    io.to(user.room).emit('message', formatMessage(user.username, msg));
    if(msg?.toLowerCase().includes("customer id")){
      var input =msg;
      authentication(input).then(status=>{
        io.to(user.room).emit('message', formatMessage(servername, "Your Credit Card request has been received and is being reviewed by our Manager shortly "));
      })
    }
    else if(msg== "Hello" || msg == "Hai"){
      io.to(user.room).emit('message', formatMessage(servername, 'Hello '+user.username +' , Please provide your customer ID (eg: Customer ID: 2424324)'));
    }
    else{
      io.to(user.room).emit('message', formatMessage(servername, "Sorry , we didn't get you"));
    }
    
  });

  // Runs when client disconnects
  socket.on('disconnect', () => {
    const user = exitRoom(socket.id);

    if (user) {
      io.to(user.room).emit(
        'message',
        formatMessage(servername, `${user.username} has left the room`)
      );

      // Current active users and room name
      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getIndividualRoomUsers(user.room)
      });
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));