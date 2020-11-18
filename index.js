require('dotenv').config();
const ccxt = require('ccxt');
const axios = require('axios');

const tick = async(config, binanceClient) => {
    const { asset, base, spread, allocation } = config;
    const market = `${asset}/${base}`;

    //cancel open orders left from previous tick, if any
    const orders = await binanceClient.fetchOpenOrders(market);
    orders.forEach(async order => {
        await binanceClient.cancelOrder(order.id, market);
    });

    //fetch current market prices
    const results = await Promise.all([
        axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'),
        axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd')
        
    ]);

    const marketPrice = results[0].data.bitcoin.usd / results[1].data.tether.usd;

    //calculate new orders parameters
    const sellPrice = marketPrice * (1 + spread);
    const buyPrice = marketPrice * (1 - spread);
    const balances = await binanceClient.fetchBalance();
    const assetBalance = balances.free[asset]; //e.g. 0.01 BTC
    const baseBalance= balances.free[base]; // e.g. 20 USDT
    const sellVolume = assetBalance * allocation;
    const buyVolume = (baseBalance * allocation) / marketPrice;

    await binanceClient.createLimitSellOrder(market, sellVolume, sellPrice);
    await binanceClient.createLimitBuyOrder(market, buyVolume, buyPrice);

    console.log(`
        New tick for ${market}...
        Created limit sell order for ${sellVolume}@${sellPrice}
        Create limit buy order for ${buyVolume}@${buyPrice}
    `);

};

const run = () => {
    const config = {
        asset: 'BTC',
        base: 'USDT',
        allocation: 0.3, //Percentage of our available funds that we trade
        spread: 0.05,     //Percentage above and below market prices for sell and buy orders
        tickInterval: 3000 //Duration between each tick, in milliseconds       
    };
    const binanceClient = new ccxt.binance({
        apiKey: process.env.API_KEY,
        secret: process.env.API_SECRET
    });
    tick(config, binanceClient);
    setInterval(tick, config.tickInterval, config, binanceClient);
};

run();