#!/bin/bash
# Build the latest install scripts and push them to the nodes

./build.sh

{ set -a; source ./node.env; set +a; }

# it is expected that you have already configured cert-auth via ssh-copy-id
[-e .env] && scp .env "root@$IP1:/root/node.env"
scp node.env "root@$IP1:/root/.env"
scp node.sh "root@$IP1:/root"
scp node.env "root@$IP2:/root/peer.env"
scp peer.sh "root@$IP2:/root"