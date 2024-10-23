const throwError = () => {
  throw new Error('this should not be called in browser');
};
export default {};
export const existsSync = throwError;
export const readFileSync = throwError;
export const mkdirSync = throwError;
export const writeFileSync = throwError;
