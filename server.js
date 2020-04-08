// Include dependencies
const express = require("express");
const bodyParser = require("body-parser");
const cors = require('cors');
const nedb = require("nedb-promises");
const axios = require("axios");
const qs = require("qs");
const basicAuth = require('express-basic-auth');

// Initialise express app
const app = express();
app.use(express.static("public"));
app.use(bodyParser.json());
app.use(cors({ origin: `https://${process.env.PROJECT_NAME}.glitch.me` }));
app.use(basicAuth({ users: { admin: process.env.ADMIN_PASSWORD }, challenge: true }));

// Create database in Glitch hidden data folder (not copied if remixed)
const db = nedb.create({ filename: ".data/db", autoload: true });

app.get("/", (request, response) => {
  response.sendFile(__dirname + "/views/index.html");
});

app.post("/numbers", async (req, res) => {
  try {
    const { NEXMO_API_KEY, NEXMO_API_SECRET } = process.env;
    const availableNumbers = await axios.get(`https://rest.nexmo.com/number/search?api_key=${NEXMO_API_KEY}&api_secret=${NEXMO_API_SECRET}&country=${req.body.country}&features=SMS,VOICE`);
    const msisdn = availableNumbers.data.numbers[0].msisdn;
    await axios({
      method: "POST",
      url: `https://rest.nexmo.com/number/buy?api_key=${NEXMO_API_KEY}&api_secret=${NEXMO_API_SECRET}`,
      data: qs.stringify({ country: req.body.country, msisdn }),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    });
    await db.insert({ msisdn });
    res.send("Number successfully bought");
  } catch (err) {
    res.send(err);
  }
});

app.get("/numbers", async (req, res) => {
  try {
    const { NEXMO_API_KEY, NEXMO_API_SECRET } = process.env;
    const dbNumbers = await db.find();
    const vonageNumbers = await axios.get(`https://rest.nexmo.com/account/numbers?api_key=${NEXMO_API_KEY}&api_secret=${NEXMO_API_SECRET}`);
    const numbersInBothResponses = vonageNumbers.data.numbers.filter(vonageNumber => {
      return dbNumbers.map(dbNumber => dbNumber.msisdn).includes(vonageNumber.msisdn)
    });
    const combinedResponses = numbersInBothResponses.map(vonageNumber => {
      return {
        ...vonageNumber,
        ...dbNumbers.find(dbNumber => dbNumber.msisdn == vonageNumber.msisdn)
      }
    })
    res.send(combinedResponses)
  } catch (err) {
    res.send(err);
  }
});

app.patch("/numbers/:msisdn", async (req, res) => {
  try {
    const { NEXMO_API_KEY, NEXMO_API_SECRET } = process.env;
    if(req.body.name) {
      await db.update({ msisdn: req.params.msisdn }, { $set: { name: req.body.name } })
    }
    if(req.body.forward) {
      await axios({
        method: "POST",
        url: `https://rest.nexmo.com/number/update?api_key=${NEXMO_API_KEY}&api_secret=${NEXMO_API_SECRET}`,
        data: qs.stringify({ 
          country: req.body.country, 
          msisdn: req.params.msisdn,
          voiceCallbackType: 'tel',
          voiceCallbackValue: req.body.forward
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" }
      })
    }
    res.send('Successfully updated')
  } catch(err) {
    res.send(err)
  }
})

app.delete("/numbers/:msisdn", async (req, res) => {
  try {
    const { NEXMO_API_KEY, NEXMO_API_SECRET } = process.env;
    await axios({
      method: "POST",
      url: `https://rest.nexmo.com/number/cancel?api_key=${NEXMO_API_KEY}&api_secret=${NEXMO_API_SECRET}`,
      data: qs.stringify({ 
        country: req.body.country, 
        msisdn: req.params.msisdn
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" }
    })
    res.send('Successfully cancelled')
    // Note: not removing from local DB because it will never be returned
  } catch(err) {
    res.send(err)
  }
})

app.listen(process.env.PORT);
