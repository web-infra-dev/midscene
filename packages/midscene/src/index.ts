import Insight from './insight';
import { Executor } from './action/executor';
import { getElement, getSection } from './query';
import { setDumpDir } from './utils';

export { plan } from './automation';

export * from './types';
export default Insight;
export { getElement, getSection, Executor, setDumpDir };
