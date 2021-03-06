/**
 * Plaception
 */

import {
  establishConnection,
  establishPayer,
  checkProgram,
  place,
  getCanvas,
} from './plaception';

async function main() {
  console.log("Plaception test program initiated...");

  // Establish connection to the cluster
  await establishConnection();

  // Determine who pays for the fees
  await establishPayer();

  // Check if the program has been deployed
  await checkProgram();

  // Place a pixel
  await place(0, 1, 0xffffff);
  await place(1, 0, 0xffaabb);
  await place(1, 1, 0x10ab4d);
  await place(0, 0, 0xd9ec33);

  // Gets canvas from account
  await getCanvas();

  console.log('Success');
}

main().then(
  () => process.exit(),
  err => {
    console.error(err);
    process.exit(-1);
  },
);
