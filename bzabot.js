require('dotenv').config()
const ethers = require('ethers');
const stakingABI = require('./contracts/BZAStaking.json');
const ERC20ABI = require('./contracts/ERC20.json');
const {Client, Intents} = require('discord.js');
const { hexZeroPad } = require('ethers/lib/utils');
const { Web3Provider } = require('@ethersproject/providers');
const { EAFNOSUPPORT } = require('constants');
const { workerData } = require('worker_threads');
const { MessageAttachment, MessageEmbed } = require('discord.js');

// Process ENV Variables
const stakingAddress = process.env.STAKING_CONTRACT_ADDRESS
const BUSDAddress = process.env.BUSD_COIN_ADDRESS
const BZAAddress = process.env.BZA_COIN_ADDRESS
const DiscordBotChannel = process.env.DISCORD_BOT_CH
const UpdatesChannel = process.env.UPDATES_DISCORD_CH
const StakingChannel = process.env.STAKING_DISCORD_CH
const RewardsChannel = process.env.REWARDS_DISCORD_CH


// ABI for Events 
let abi = [ "event Transfer(address indexed from, address indexed to, uint value)" ];
let iface = new ethers.utils.Interface(abi);

// Establish Connection to Web3 BSC Provider + Contract
const webSocketProvider = new ethers.providers.WebSocketProvider(process.env.WEB_SOCKET_NODE);
const BZAStakeContract = new ethers.Contract(stakingAddress, stakingABI, webSocketProvider);
const BUSDContract = new ethers.Contract(BUSDAddress, ERC20ABI, webSocketProvider);
var BZAConnected = null;

// Setup and Establish Discord Bot Connection
const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]
})

// ********************************
// RECURRING FUNCTIONS
//
// ********************************


// ON BOT DEPLOY
async function establisContractConnection() {
    const info = await webSocketProvider.getNetwork()

    // Connect to Contract Owner Wallet
    const EOA = new ethers.Wallet(process.env.CONTRACT_OWNER_KEY, webSocketProvider)
    BZAConnected = BZAStakeContract.connect(EOA)

    // Set daily time inerval on reward distributions 
    setInterval(dailyRewards, 86400001);
    setInterval(dailyUpdates, 86400001);

}

// Daily dist. of rewards
async function dailyRewards() {
    client.channels.cache.get(DiscordBotChannel).send('Sending New Rewards Test ever 5 seconds');

    try {
        const rewards = await BZAConnected.distributeRewards()
        await client.channels.cache.get(DiscordBotChannel).send("Rewards Dsitributed Today!");

    } catch (e) {
        console.log("Reward Distribution Failed")
        console.log(e)
    }

}

establisContractConnection();

// Discord - ON BOT CONNECT 
client.on('ready', function(e) {
    console.log(`Logged in as ${client.user.tag}!`)
    client.channels.cache.get(DiscordBotChannel).send('BZA Bot Connected');
    
})

// Connect Discord Bot
client.login(process.env.DISCORD_TOKEN)




async function getBUSDBal(){
    try {
        var balance = await BUSDContract.balanceOf("0x5548ED93f4255875346b0f71562d58026cDf0FdE");
    } catch (e) {
        console.log("fatal error");
        console.log(e);
    }
    balance = ethers.utils.formatEther(balance);
    await client.channels.cache.get(DiscordBotChannel).send("New BUSD Balance on Contract: " + balance);
}

async function createReward(_amount){
    try {
        const transaction = await BZAConnected.createRewardSchedule(_amount , BUSDAddress)
        console.log("new reward schedule created")
        console.log(transaction)
    } catch (e) {
        console.log("fatal error");
        console.log(e);
    }
}    
    // uint totalAmt; 
    //     uint dailyAmt;
    //     uint daysRemain;  
    //     bool active; 

async function testSchedules() {
    const rewards = await BZAConnected.getRewardSchedules()
    for (var x = 0; x < rewards.length; x++) {
        client.channels.cache.get(DiscordBotChannel).send("-------------------");
        client.channels.cache.get(DiscordBotChannel).send("Reward Schedule #" + x);
        const total = await rewards[x][0].toString()
        const dailyAmt = await rewards[x][1].toString()
        const daysLeft = await rewards[x][2].toString()
        const active = await rewards[x][3].toString()


        await client.channels.cache.get(DiscordBotChannel).send("Total Reward Amt: " + ethers.utils.formatEther(total) + "BUSD");
        await client.channels.cache.get(DiscordBotChannel).send("Daily Distributions: " + ethers.utils.formatEther(dailyAmt)  + "BUSD");
        await client.channels.cache.get(DiscordBotChannel).send("Days Remaining: " + daysLeft + " days");
        await client.channels.cache.get(DiscordBotChannel).send("Reward Active: " + active);
        client.channels.cache.get(DiscordBotChannel).send("-------------------");

    }

}


// ********************************
// DISCORD BOT FUNCTIONS
//
// ********************************

    async function dailyUpdates() {
                const stakes = await BZAConnected.getTotalStaked()
                const stakeOut = await ethers.utils.formatEther(stakes)
                const file = new MessageAttachment('./assets/bzaLogo.png');
    
                const bzaReport = new MessageEmbed()
                .setColor('#F19D67')
                .setTitle('Bonanza.Money')
                .setURL('https://bonanza.money/')
                .setAuthor({ name: 'BZA Report', iconURL: 'attachment://bzaLogo.png', url: 'https://bonanza.money/' })
                .setDescription('Daily Bonanza.Money Status Report')
                .setThumbnail('attachment://bzaLogo.png')
                .addFields(
                { name: '\u200B', value: '\u200B' },
                { name: 'Current BZA Staked Balance', value: stakeOut + " BZA" },
                { name: '\u200B', value: '\u200B' },
                )
                .setTimestamp()
                .setFooter({ text: 'Check back tomorrow for more updates', iconURL: 'attachment://bzaLogo.png' });
    
                client.channels.cache.get(UpdatesChannel).send({ embeds: [bzaReport], files: [file]});
                client.channels.cache.get(UpdatesChannel).send("@everyone Testnet Updates");
    
    }

    client.on('message',
    async function(msg){
        if(msg.content === "test"){

            client.channels.cache.get(DiscordBotChannel).send("Current Reward Schedules on Test Net: ");

            testSchedules()


        }
    })

// ********************************
// FILTERS FOR 
// EVENT LISTENERS FOR BZA STAKING CONTRACT 
// 
// ********************************

// BUSDAddress transfers  *to*  hexZeroPad address:
const rewardFilter = {
    address: BUSDAddress,
    topics: [
        ethers.utils.id("Transfer(address,address,uint256)"),
        null,
        hexZeroPad("0xeF4Fc808Cab6ee271538C355dB310eeC6B218490", 32)
    ]
};

// ********************************
// EVENT LISTENERS FOR BZA STAKING CONTRACT 
//
// ********************************

// Event Fired when BUSD is sent to the Staking Contract
webSocketProvider.on(rewardFilter, (log) => {
    console.log(log)
    client.channels.cache.get(DiscordBotChannel).send("New BUSD Rewards Recieved");
    getBUSDBal(stakingAddress);
    createReward(amount) 

})

// Event Fired when Reward Schedule has been Created
BZAStakeContract.on('RewardRecieved', (amount, afterBonus, dailyAmt, timeCreated) => {
    const logo = new MessageAttachment('./assets/bzaLogo.png');
    const rewardCreated = new MessageEmbed()
	        .setColor('#F19D67')
	        .setTitle('New Reward Schedule Created')
	        .setAuthor({ name: 'BZA Staking Contract Watcher', iconURL: 'attachment://bzaLogo.png'})
	        .setThumbnail('attachment://bzaLogo.png')
	        .addFields(
                { name: 'Reward Value (Pre Bonus Distributions):', value: ethers.utils.formatEther(amount) + " BUSD" },
                { name: 'Reward Value Final:', value: ethers.utils.formatEther(afterBonus) + " BUSD" },
                { name: 'Daily Distributions over 7 days:', value: ethers.utils.formatEther(dailyAmt) + " BUSD" },
                )
	        .setTimestamp()

            client.channels.cache.get(RewardsChannel).send({ embeds: [rewardCreated], files: [logo]});
            client.channels.cache.get(RewardsChannel).send("@everyone Testnet Updates");

        })

// Event Fired when New Stake is Created
BZAStakeContract.on('NewStake', (staker, amt) => {
    const logo = new MessageAttachment('./assets/bzaLogo.png');
    const stakeAlert = new MessageEmbed()
	        .setColor('#F19D67')
	        .setTitle('New Stake on Bonanza.Money')
	        .setAuthor({ name: 'BZA Staking Contract Watcher', iconURL: 'attachment://bzaLogo.png'})
	        .setThumbnail('attachment://bzaLogo.png')
	        .addFields(
                { name: 'Stake Value:', value: ethers.utils.formatEther(amt) + " BZA" },
                { name: 'Staker:', value: staker },
                )
	        .setTimestamp()

            client.channels.cache.get(StakingChannel).send({ embeds: [stakeAlert], files: [logo]});
            client.channels.cache.get(StakingChannel).send("@everyone Testnet Updates");

})


