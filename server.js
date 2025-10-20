require('dotenv').config();
const express = require('express');
const jsforce = require('jsforce');

const {
  SF_CLIENT_ID,
  SF_CLIENT_SECRET,
  SF_REDIRECT_URI,
  SF_LOGIN_URL
} = process.env;

const app = express();
const PORT = process.env.PORT || 3000;

let conn = new jsforce.Connection({
  oauth2: {
    loginUrl: SF_LOGIN_URL,
    clientId: SF_CLIENT_ID,
    clientSecret: SF_CLIENT_SECRET,
    redirectUri: SF_REDIRECT_URI
  }
});

let accessToken = null;
let instanceUrl = null;
let cachedOpportunities = [];

// OAuth login endpoint
app.get('/oauth/login', (req, res) => {
  const url = conn.oauth2.getAuthorizationUrl({ scope: 'full refresh_token api' });
  res.redirect(url);
});

// OAuth callback endpoint
app.get('/oauth/callback', async (req, res) => {
  const code = req.query.code;
  try {
    await conn.authorize(code);
    accessToken = conn.accessToken;
    instanceUrl = conn.instanceUrl;
    res.send('Authenticated! You can now pull data.');
  } catch (err) {
    res.status(500).send('OAuth Error: ' + err.message);
  }
});

// Pull Opportunity data from Salesforce
app.get('/pull', async (req, res) => {
  if (!accessToken || !instanceUrl) {
    return res.status(401).send("Not authenticated. Please login via /oauth/login.");
  }
  // Example SOQL query, replace WHERE clause to match your list view ('tsvi_ops')
  // You can refine this once you know your view's filter logic
  try {
    const result = await conn.query(
      "SELECT Id, Name, Amount, StageName, CloseDate, Owner.Name FROM Opportunity"
    );
    cachedOpportunities = result.records;
    res.json({ count: cachedOpportunities.length, sample: cachedOpportunities.slice(0, 5) });
  } catch (err) {
    res.status(500).send('Salesforce query error: ' + err.message);
  }
});

// Basic analysis endpoint
app.get('/analysis', (req, res) => {
  if (!cachedOpportunities.length) {
    return res.status(400).send("No Opportunity data cached. Run /pull first.");
  }
  // Example: total amount and breakdown by StageName
  const totalAmount = cachedOpportunities.reduce((sum, opp) => sum + (opp.Amount || 0), 0);
  const byStage = {};
  cachedOpportunities.forEach(opp => {
    byStage[opp.StageName] = (byStage[opp.StageName] || 0) + (opp.Amount || 0);
  });
  res.json({ totalAmount, byStage });
});

app.listen(PORT, () => {
  console.log(`Salesforce MCP server running on http://localhost:${PORT}`);
});
