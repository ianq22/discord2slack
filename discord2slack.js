// ---------------------- How to configure a Discord bot: ----------------------
// 1: Create an app : https://discordapp.com/developers/applications/me
// 2: When app is created, click on "Create a Bot User"
// 3: Name bot, copy the Token + Client ID, paste them in the conf. section below and save changes.
// 4: Go to this URL (replace the Client ID)
//    https://discordapp.com/oauth2/authorize?client_id=YOUR_CLIENT_ID_HERE&scope=bot&permissions=3072
// 5: Choose the server you want to give your bot access to and click OK (or wtv the button is named)
// 6: Go on Discord and give permission to your bot to read and write msgs
// 7: Copy Channel ID or Channel Name and paste it in the conf. section below.

// ----------------------- How to configure a Slack bot: ------------------------
// 1: Go to https://YOUR_SERVER.slack.com/apps/manage/custom-integrations
// 2: Click on Bots
// 3: Click on Add Integration
// 4: Name your bot, copy the Token and paste it in the conf. section below.
// 5: Invite the bot to the wanted channel (/invite @my-l33t-bot)
// 6: Copy the channel name in the conf. section below.


// -----------------------------Configurable section-----------------------------
const PropertiesReader = require('properties-reader');
const prop = PropertiesReader('app.properties');
getProperty = (pty) => {return prop.get(pty);}

const DEBUG = true;

const DISCORD_TOKEN            = getProperty('discord.token');
const DISCORD_CHANNEL          = getProperty('discord.channel');
const DISCORD_CHANNELID        = getProperty('discord.channelId');
const DISCORD_ONEWAY_CHANNEL   = getProperty('discord.oneWayChannel');
const DISCORD_ONEWAY_CHANNELID = getProperty('discord.oneWayChannelId');
const SLACK_TOKEN              = getProperty('slack.token');
const SLACK_CHANNEL            = getProperty('slack.channel');
const SLACK_CHANNEL_PRIVATE    = getProperty('slack.channel.private');
// ------------------------------------------------------------------------------

//Check if config is valid
var discord_token_not_set = DISCORD_TOKEN === '';
var discord_channel_not_set = DISCORD_CHANNEL === '' && DISCORD_CHANNELID === '';
var slack_token_not_set = SLACK_TOKEN === '';
var slack_channel_not_set = SLACK_CHANNEL === '';

var discord_config_invalid = discord_token_not_set || discord_channel_not_set;
var slack_config_invalid = slack_token_not_set || slack_channel_not_set;

if (discord_config_invalid || slack_config_invalid) {
	console.log ((discord_config_invalid ? 'Discord config' : 'Slack config') + ' is invalid');
	console.log('You need to configure your Discord and Slack tokens and channels' +
	            'in the file discord2slack.js. It\'s right in the header.');
	process.exit(1);
}

//Configure stuff
const Discord = require('discord.js');
const discord_client = new Discord.Client();
const SlackBot = require('slackbots');
const slack_client = new SlackBot({token: SLACK_TOKEN, name: 'Discord'});

var discord_channel;

//Debug me plenty
function debug(msg) { if (DEBUG) { console.log(msg); } }

//Let's configure events:

discord_client.on('ready', function(){
	//Finding the right channel where to send the messages
	var param = DISCORD_CHANNEL !== '' ? 'name' : 'id';
	var value = DISCORD_CHANNEL !== '' ? DISCORD_CHANNEL : DISCORD_CHANNELID;
	var potential_channels = discord_client.channels.findAll(param, value);
	if (potential_channels.length === 0) {
		console.log('Error: No Discord channels with ' + param + ' ' + value + ' found.');
		process.exit(1);
	}
	if (potential_channels.length > 1) {
		console.log('Warning: More than 1 Discord channel with ' + param + ' ' + value + ' found.');
		console.log('Defaulting to first one found');
	}

	//Channel found
	discord_channel = potential_channels[0];
	console.log('Discord connected');
});

slack_client.on('start', function() {
	console.log('Slack connected');
});

//Redirect Discord messages to Slack
discord_client.on('message', function(message) {
	var channelIdList = [DISCORD_CHANNELID, DISCORD_ONEWAY_CHANNELID];
	var channelList = [DISCORD_CHANNEL, DISCORD_ONEWAY_CHANNEL];

	//Check if message is from the discord channel configured above
	//(Thanks athyk)
	if (!channelIdList.includes(message.channel.id) && !channelList.includes(message.channel.name)) { return; }
	
	//Avoiding re-sending a message we just received from Slack
	//(event gets triggered even if it's a msg *we* sent to the chat)
	if (message.author.username != discord_client.user.username) {
		//Check for atachements (files/images/etc.)
		var content = message.content;
		if (message.attachments != null) {
			var attachments = message.attachments.array();
			attachments.forEach(a => { content += "\n" + a.url; });	
		}
		content = content.replace('!mods', '<!here>');

		//Replace any mentioned Users with their user names
		discord_client.users.forEach(function(someUser) {
			if (content.includes(someUser.id) && someUser.id.length === 18) {
				content = content.replace(someUser.id, someUser.username);
			}
		});

		debug('Discord --> ' + message.author.username + ' : ' + content);
		if (SLACK_CHANNEL_PRIVATE) {
			slack_client.postMessageToGroup(SLACK_CHANNEL, '*' + message.author.username + '* : ' + content, {as_user: true});
		} else {
			slack_client.postMessageToChannel(SLACK_CHANNEL, '*' + message.author.username + '* : ' + content, {as_user: true});
		}
	}
});

//Redirect Slack client to Discord
slack_client.on('message', function(message) {
	var messageToSend = message.text;
	var isBotMessage = false;

	if (message.type === 'message') {
		//Unlike Discord, event doesn't get triggered if it is a msg we sent

		//We have to find the user name/nickname by ourselves though
		slack_client.getUsers()._value.members.forEach(function(elem){
			if (elem.id === message.user) {
				if (elem.name !== 'modbot' && elem.name !== 'discordbot') {
					username = elem.name;

					debug('Slack  --> ' + username + ' : ' + message.text);

					messageToSend = '**' + username + '**' + ' : ' + message.text;
				} else {  //If it's a bot message don't send it
					isBotMessage = true;
				}
			}

			//If we have a user mention in the text replace it with the users name and strip out the <> characters
			if (messageToSend === 'includes' && messageToSend.includes(elem.id)) {
				messageToSend = messageToSend.replace('<@' + elem.id + '>', '@' + elem.name);
			}
		});

		if (!isBotMessage && messageToSend !== undefined) {
			discord_channel.send(messageToSend);
		}
	}
});

discord_client.login(DISCORD_TOKEN);
