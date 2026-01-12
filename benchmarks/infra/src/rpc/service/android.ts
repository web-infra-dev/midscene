import fs from 'fs';
import path from 'path';

import { agentFromAdbDevice, AndroidAgent } from '@midscene/android';

import { IRPCService, AndroidDevice } from '../../types';

const MIDSCENE_BENCH_DIR = 'midscene_bench';

process.env.MIDSCENE_RUN_DIR = MIDSCENE_BENCH_DIR;

export class AndroidRPCService implements IRPCService {
  private agent: AndroidAgent | undefined;

  constructor(private device: AndroidDevice) {}

  public async setup(fileName?: string) {
    if (this.device.type === 'Local') {
      this.agent = await agentFromAdbDevice(this.device.deviceId);
    } else {
      this.agent = await agentFromAdbDevice(undefined, {
        remoteAdbHost: this.device.host,
        remoteAdbPort: this.device.port,
      });
    }

    this.agent.setAIActContext(`
use Launch in  action space to open an app is always preferred than using the system app drawer. These apps are available in this system: 
"Audio Recorder": "com.dimowner.audiorecorder"
"Broccoli Recipe": "com.flauschcode.broccoli"
"Camera": "com.android.camera2"
"Chrome": "com.android.chrome"
"Clock": "com.google.android.deskclock"
"Contacts": "com.google.android.contacts"
"Files": "com.google.android.documentsui"
"Joplin": "net.cozic.joplin"
"Markor": "net.gsantner.markor"
"MiniWob": "com.google.androidenv.miniwob"
"OpenTracks": "de.dennisguse.opentracks"
"OsmAnd": "net.osmand"
"Phone / Dialer": "com.google.android.dialer"
"Pro Expense": "com.arduia.expense"
"Retro Music": "code.name.monkey.retromusic"
"Settings": "com.android.settings"
"Simple Calendar Pro": "com.simplemobiletools.calendar.pro"
"Simple Draw Pro": "com.simplemobiletools.draw.pro"
"Simple Gallery Pro": "com.simplemobiletools.gallery.pro"
"Simple SMS Messenger": "com.simplemobiletools.smsmessenger"
"Tasks": "org.tasks"
"VLC": "org.videolan.vlc"
"Android World": "com.example.androidworld"
"Clipper": "ca.zgrs.clipper"
'`);

    if (fileName) {
      this.agent.reportFileName = fileName;
    }
  }

  public async ai(task: string): Promise<any> {
    if (!this.agent) {
      throw new Error('Android agent not setup');
    }
    return this.agent.ai(task);
  }

  public terminate(status: 'Successful' | 'Failed' | undefined): Promise<void> {
    if (!this.agent) {
      console.warn('Android agent not setup, nothing to terminate');
      return Promise.resolve();
    }

    let reportDir = path.resolve(process.cwd(), MIDSCENE_BENCH_DIR, 'report');
    let reportName = this.agent.reportFileName;
    const reportPath = path.join(reportDir, `${reportName}.html`);

    if (fs.existsSync(reportPath)) {
      const targetStatus =
        status === 'Successful'
          ? 'Pass'
          : status === 'Failed'
            ? 'Fail'
            : 'Unknown';

      fs.renameSync(
        reportPath,
        path.join(reportDir, `${reportName}-${targetStatus}.html`),
      );
    }

    return this.agent?.destroy();
  }
}
