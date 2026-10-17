# URI Hackathon Rapid-Build

## Trailmap (System One + Jev)

Middleware agentic model acts as a HTTP request classifier between the frontend and backend ensuring no HTTP log susicious or not goes unmissed. 

## LAN (Wifi_LAN)

Three-laptop overlay for URI guest Wi-Fi (client isolation). Unzip `LAN/wifi-lan-handoff.zip` or clone this repo and use the `LAN/` folder.

Teammates: open `LAN/START_HERE.txt` — `npm install`, lead runs `npm run relay`, others `npm run join`.

## Project Structure
/Example1
```
Example website that integrates the service
Use this to see a full working example of the service integration.
```

/Service
```
The actual AI classification service that integrates with website backends.
```

## Installation
* download the code
* run `npm install` in both /Example1 and /Service
* add the .env file in both folders as well, both folders need a copy of the .env variables.
put `APIKEY=""` and `SERVICEPORT=""` into both .env files

## How to use
* run the following command in both /Example1 and /Service (prefferable two different)
```
npm run start
```

go to http://localhost:3000/ and login.
the service will not flag it.

Use the post.js or cliexample.js to do custom posts to reach other endpoints, watch the model flag it if its suspicious.