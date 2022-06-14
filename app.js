

/* imports */
const path = require('path');
const http = require('http');
const express = require('express');
const axios = require('axios')
const bodyParser = require("body-parser");
const socketio = require('socket.io');
const dialogflow = require('@google-cloud/dialogflow');
const uuid = require('uuid');

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

const sessionId = uuid.v4();
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
  username : 'skoorma',
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

async function runSample(msg,projectId = 'aari-test-agent-fafl') {
  // A unique identifier for the given session
  

  // Create a new session
  const sessionClient = new dialogflow.SessionsClient({
      keyFilename: "aari-test-agent-fafl-ed69179a6fb1.json"
  });
  const sessionPath = sessionClient.projectAgentSessionPath(
    projectId,
    sessionId
  );

  // The text query request.
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        // The query to send to the dialogflow agent
        text: msg,
        // The language used by the client (en-US)
        languageCode: 'en-US',
      },
    },
  };

  // Send request and log result
  const responses = await sessionClient.detectIntent(request);
  console.log('Detected intent');
  const result = responses[0].queryResult;
  console.log(`  Query: ${result.queryText}`);
  console.log(`  Response: ${result.fulfillmentText}`);
  if (result.intent) {
    console.log(`  Intent: ${result.intent.displayName}`);
  } else {
    console.log('  No intent matched.');
  }
  return result.fulfillmentText;
}


async function authenticateAndDeployBot(customerID){
  var url = ControlRoomURL+'v1/authentication';
  const data = {
    "username": usercredentails.username,
    "password": usercredentails.password
  }

  return axios
  .post(url, data)
  .then(res => {
    authToken = res?.data?.token;
    //return res;
    return  deployBot(authToken,customerID).then(res=>{
      return res;
    })
  })
  .catch(error => {
    console.error(error)
    return error;
  })
}



async function deployBot( authToken,customerID){
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
          "string": customerID//input?.split('ID:')?.[1] //key must match type, in this case string
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
      
      return res;
     
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
    socket.emit('message', formatMessage(servername, 'Welcome to Acme Bank'));
    //socket.emit('message', formatMessage(servername, 'Kindly provide your customer ID (eg: Customer ID: 100)'));
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


  
app.post('/bot-response-error',(req,res)=>{
  console.log(req.body);
  res.send({message:req.body['error-message']});
  //io.to("Room").emit('message', formatMessage(servername, 'Message from Bot : ' + JSON.stringify(req.body)));
  io.to("Room").emit('message', formatMessage(servername, req.body['error-message']));
});



app.post('/cc-botdeployment',(req,res)=>{
  console.log(req.body);
  res.send({message:req.body['request_id']});
  //io.to("Room").emit('message', formatMessage(servername, 'Message from Bot : ' + JSON.stringify(req.body)));
  //io.to("Room").emit('message', formatMessage(servername, 'Your Request ID has been generated . Request ID:  ' + (parseInt(req.body['request_id'])+1).toString() + " and is being reviewed by our Manager shortly "));
  io.to("Room").emit('message', formatMessage(servername, "Your Request ID has been generated and is being reviewed shortly .Please keep a note of the Request ID: "+(parseInt(req.body['request_id'])+1).toString()+" for future reference."));
  sleep(10);
  io.to("Room").emit('message', formatMessage(servername, "We’ll let you know once your Credi card request has been reviewed"));

//
//Please keep a note of the Transaction ID for future reference.
});




app.post('/cc-approval-status',(req,res)=>{
  console.log(req.body);
  res.send({status:req.body['status'] });
  if(req.body?.status == 'Approved'){
    io.to("Room").emit('message', formatMessage(servername, 'Your Credit Card request has been Approved'));
  }else if(req.body?.status == 'Rejected'){
    io.to("Room").emit('message', formatMessage(servername, 'Your Credit Card request has been Rejected'));
    
  }else{
    io.to("Room").emit('message', formatMessage(servername, 'Something went wrong .'));
  }
});

//message1
//message2

// Listen for client message
  socket.on('chatMessage',async msg => {
    const user = getActiveUser(socket.id);
    io.to(user.room).emit('message', formatMessage(user.username, msg));
    await  runSample(msg).then(data=>{
          console.log(data);
           io.to(user.room).emit('message', formatMessage(servername,data));
          if(data?.includes("Thanks for sharing. I can submit a Credit card request for your Customer Id:")){
            console.log("yes");

            var splitted = data.split("Thanks for sharing. I can submit a Credit card request for your Customer Id:")?.[1];
            var customerId = splitted.split(". Please wait")?.[0].trim();
            authenticateAndDeployBot(customerId).then(async status=>{
                sleep(10000)
                io.to(user.room).emit('message', formatMessage(servername, "Credit Card request has been initiated for the Customer ID:"+customerId+" ."));
              });
          }
       // res.send({Reply:data})
     });
    
  });





  // Listen for client message
  socket.on('chatMessage1',async msg => {
    const user = getActiveUser(socket.id);
    io.to(user.room).emit('message', formatMessage(user.username, msg));
    if(msg?.toLowerCase().includes("id:")){
      var input =msg;
      authentication(input).then(async status=>{
        await  runSample(msg).then(data=>{
          console.log(data);
          io.to(user.room).emit('message', formatMessage(servername,data));
       // res.send({Reply:data})
        });

        //io.to(user.room).emit('message', formatMessage(servername, "Your Credit Card request has been received and is being reviewed by our Manager shortly "));
      })
    }
    // else if(msg== "Hello" || msg == "Hai"){
    //   io.to(user.room).emit('message', formatMessage(servername, 'Hello '+user.username +' , Please provide your customer ID (eg: Customer ID: 100)'));
    // }
    else{
    
      await  runSample(msg).then(data=>{
          console.log(data);
          io.to(user.room).emit('message', formatMessage(servername,data));
       // res.send({Reply:data})
        });
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

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));