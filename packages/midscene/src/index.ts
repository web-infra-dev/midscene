import { Executor } from './action/executor';
import Insight from './insight';
import { getElement, getSection } from './query';
import { setDumpDir } from './utils';

export { plan } from './automation';

export * from './types';
export default Insight;
export { getElement, getSection, Executor, setDumpDir };
