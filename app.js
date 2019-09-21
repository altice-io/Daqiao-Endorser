import express from 'express';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { u32 } from '@polkadot/types';
import { isMainThread } from 'worker_threads';
import { Keyring } from '@polkadot/keyring';
import { Text } from "@polkadot/types";
import { RSA_NO_PADDING } from 'constants';
import child_process from "child_process";

const FABRIC_BANK_ADDRESS = "bc347b901e7da41e726a7d9dd790fa4e81274822bb9ac006e5a822751315f701";
const CHAINID_FABRIC = 1
const CHAINID_ETH = 2
const Web3 = require('web3');

function initApi() {
    const wsProvider = new WsProvider('ws://127.0.0.1:9944');
    return ApiPromise.create({
        provider: wsProvider,
        types: {
            ChainId: 'u32',
            Erc20MintableBurnable: {},
            ExtTxID: 'Vec<u8>',
            PledgeInfo: {
                chain_id: "u32",
                ext_txid: "Vec<u8>",
                account_id: "AccountId",
                pledge_amount: "TokenBalance",
                can_withdraw: "bool",
                withdraw_history: "Vec<Vec<u8>>"
            },
            Symbol: 'Vect<u8>',
            TokenBalance: 'u128',
            TokenDesc: 'Vec<u8>',
            TokenId: 'u32',
        }
    });
}


var alice;
var api;
var keyring;

var app = express();
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

async function main() {
    api = await initApi();
    keyring = new Keyring({ type: 'sr25519' });
    alice = keyring.addFromUri('//Alice');
    var bob = keyring.addFromUri('//Bob');

    app.use(function (err, req, res, next) {
        res.status(500).send(err);
    })

    app.get('/', async function (req, res) {
        //const out = await api.tx.daqiao.pledge(1, new Text("hello")).signAndSend(alice);
        //const chain = await api.rpc.system.chain();
        console.log(bob.address);
        const unsub = await api.tx.balances.transfer(bob.address, 2000000).signAndSend(alice,
            (result) => {
                console.log(`Current status is ${result.status}`);

                if (result.status.isFinalized) {
                    console.log(`Transaction included at blockHash ${result.status.asFinalized}`);
                    unsub();
                }
            });
        res.send({ "body": "ok" })
    });

    /*
    {
        "txid":"",
        "chainid":"",
    }
    */
    app.post("/pledge", async (req, res) => {
        const bank_addr = "";
        var body = req.body;
        var chainid = body["chainid"];
        var txid = body["txid"];
        if (chainid == CHAINID_FABRIC) {
            var tx = fabric_query_tx(txid);
            if (tx.to != FABRIC_BANK_ADDRESS) {
                res.status(400).send("bad to address, not bank");
                return
            }
            daqiao_pledge_exists(txid);
            daqiao_pledge(chainid, txid, tx.address, tx.amount);
        }
        res.send({ "code": 200 })
    });

    /*
    {
        "txid":"",
        "chainid":"",
    }
    */
    app.post("/withdraw", async (req, res) => {
        const bank_addr = "";
        var body = req.body;
        var txid = body["txid"];
        var chainid = body["chainid"];
        if (chainid == FABRIC_BANK_ADDRESS) {
            var pledge_info = daqiao_query_pledge(txid);
            if (!pledge_info.can_withdraw) {
                res.status(400).send("can't withdraw");
                return;
            }
            fabric_transfer(pledge_info.to, pledge_info.amount)
        }
    });

    app.listen(3000, function () {
        console.log('Example app listening on port 3000!');
    });
}

function fabric_query_tx(txid) {
    var response = child_process.spawnSync("./fbtool", ["query", "--txid", txid]);
    if (response.status != 0) {
        console.log(response.stdout.toString());
        console.log(response.stderr.toString());
        throw ("bad txid");
    }
    var args = JSON.parse(response.stdout);
    // transfer alice 10 0x123456
    return {
        to: args[1],
        amount: args[2],
        address: args[3],
    }
}

function fabric_transfer(to, amount) {
    var response = child_process.spawnSync("./fbtool", ["chaincode", "invoke", "transfer", to, amount]);
    if (response.status != 0) {
        console.log(response.stdout.toString());
        console.log(response.stderr.toString());
        throw ("bad txid");
    }
}

async function daqiao_pledge(chainid, txid, to, amount) {
    var tx = api.tx.daqiao.pledge(chainid, txid, amount, to);
    console.log(tx.toString())
    var unsub = await tx.signAndSend(alice, (result) => {
        console.log(`Current status is ${result.status}`);
        if (result.status.isFinalized) {
            console.log(`Transaction included at blockHash ${result.status.asFinalized}`);
            unsub();
        }
    });
}

async function daqiao_withdraw(chainid, txid, to, amount) {
    var unsub = await api.tx.daqiao.pledge(chainid, txid, amount, to).signAndSend(alice, (result) => {
        console.log(`Current status is ${result.status}`);
        if (result.status.isFinalized) {
            console.log(`Transaction included at blockHash ${result.status.asFinalized}`);
            unsub();
        }
    });
}

async function daqiao_query_pledge(pledgeid) {
    return {
        to: "6114e00d13745ed50224b9c895cf46f43caac7d2c5abec417268dd3c81ea253b",
        amount: 100,
        can_withdraw: true,
    }
}

async function daqiao_pledge_exists(txid) {
    var response = await api.query.daqiao.pledgeRecords(txid);
    console.log(response.toString());
}

main()