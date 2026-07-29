import { checkContracts } from './contract-check.mjs';
try {
  const result = checkContracts();
  console.log(`P3-014 planning contract check passed (${result.operations} parsed operations)`);
} catch (error) {
  console.error(`P3-014 planning contract check failed: ${error.message}`);
  process.exitCode = 1;
}
