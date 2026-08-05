const failures = [];
if (process.env.HARNESS_FINALIZE_OUTCOME !== 'success') {
  failures.push('the harness finalizer did not complete');
}
if (process.env.HARNESS_UPLOAD_OUTCOME !== 'success') {
  failures.push('the Trace Bundle was not uploaded');
}
if (
  process.env.HARNESS_SUMMARY_OUTCOME &&
  process.env.HARNESS_SUMMARY_OUTCOME !== 'success'
) {
  failures.push('the harness summary was not published');
}
if (process.env.HARNESS_CONCLUSION !== 'success') {
  failures.push(
    `the harness conclusion is ${process.env.HARNESS_CONCLUSION || 'missing'}`,
  );
}

if (failures.length > 0) {
  console.error(`::error::Harness failed: ${failures.join('; ')}`);
  process.exitCode = 1;
}
