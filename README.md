# DejenSecurity

An android application that helps protect users in Ethiopia from SMS phishing, fake Telebirr lotteries and fake bank notifications.

## GitHub

[https://github.com/Dejen-Security/dejen](https://github.com/Dejen-Security/dejen)

### Video Path

file named "Dejen Security -- Video Demonstration.mov"



## Project Details

### Summary

With the widespread adoption of mobile money platforms like Telebirr and banking apps within Ethiopia there has been an increase in scammers targeting users with SMS messages. This commonly comes in the form of fake lotteries and fake notifications that tell you your account has been blocked. These cannot always be picked up by standard messaging apps. DejenSecurity can help by being a local application that will scan for any messages and provide alerts.

### Features

Intercepts SMS in real time: Listens out for incoming SMS messages and picks up any threats.

AI and Local Blacklist: This feature uses a local blacklist developed by the community to detect fake messages quickly whilst offline, and AI to analyse any unknown or complicated messages.

Scan Inbox: Once installed you can scan through recent messages in your inbox. You can also paste/select a suspicious message to receive a score and reason for why it is risky.

Report Scam Numbers: Report scam numbers. Any unknown numbers that receive 3 suspicious reports will be automatically reported to our backend database.

Offline: If there is no internet whilst receiving a text message it will store the message locally until internet is available.

### Tech Used

Frontend: React Native, Expo, NativeWind (Tailwind)

Backend: Cloudflare Workers (KV)

Android Native: Created custom module using Java/Kotlin (`SmsReaderModule`).

## Team Members

Kaleab Tamru (CTC-4333-26)

Natanim Merkebu (CTC-220-26)

David Habte (CTC-801-26)

Abrham Gebremedhin (CTC-712-26)

Elyus Redae (CTC-737-26)

Nahom Kiflu (CTC-454-26)
