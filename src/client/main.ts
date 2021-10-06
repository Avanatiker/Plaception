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
  await place();

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
