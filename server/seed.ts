import 'dotenv/config';
import { db } from './db.js';
const venues=(db.prepare('SELECT COUNT(*) n FROM venues').get() as {n:number}).n;
const vendors=(db.prepare('SELECT COUNT(*) n FROM vendors').get() as {n:number}).n;
if(!venues||!vendors) throw new Error('Sample catalogue was not initialized. Remove the local database file and run the server once.');
console.log(`Local database ready: ${venues} venues and ${vendors} service providers.`);
if(process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD) console.log(`Administrator account is ready for ${process.env.ADMIN_EMAIL}.`);
else console.log('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before starting the server to create an administrator.');
