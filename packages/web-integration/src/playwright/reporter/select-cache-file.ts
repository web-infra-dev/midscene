import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';

interface Task {
  type: string;
  prompt: string;
  pageContext: {
    url: string;
    width: number;
    height: number;
  };
  response: any;
}

interface TasksFile {
  taskFile: string;
  taskTitle: string;
  aiTasks: Task[];
}

interface SelectedFilePrompt {
  selectedFile: string;
}

interface ActionPrompt {
  action: 'select' | 'exclude';
}

interface SelectedTasksPrompt {
  selectedTasks: number[];
}

// Get all JSON files in the current directory
const getJsonFiles = (dir: string): string[] => {
  return fs.readdirSync(dir).filter((file) => path.extname(file) === '.json');
};

// Read JSON file content
const readJsonFile = (filePath: string): TasksFile => {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

// Write JSON file content
const writeJsonFile = (filePath: string, data: TasksFile): void => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

// Format tasks for display
const formatTasks = (tasks: Task[]): string => {
  return tasks
    .map((task, _index) => {
      return `[ ] ${task.type}: ${task.prompt}`;
    })
    .join('\n');
};

// Main function
export const getTask = async (): Promise<void> => {
  const targetDir = path.join(process.cwd(), 'midscene_run/cache');
  const jsonFiles = getJsonFiles(targetDir);

  if (jsonFiles.length === 0) {
    console.log('No JSON files found in the current directory.');
    return;
  }

  // Let the user select the JSON file to process
  const selectedFile = await inquirer.prompt<SelectedFilePrompt>([
    {
      type: 'list',
      name: 'selectedFile',
      message: 'Select the JSON file to process',
      choices: jsonFiles,
    },
  ] as any);
  console.log('selectedFile', selectedFile);

  const filePath = path.join(targetDir, selectedFile.selectedFile);
  const tasksFile: TasksFile = readJsonFile(filePath);

  // Provide options to select or exclude tasks
  const { action } = await inquirer.prompt<ActionPrompt>([
    {
      type: 'list',
      name: 'action',
      message: 'Choose an action',
      choices: [
        { name: 'Select tasks', value: 'select' },
        { name: 'Exclude tasks', value: 'exclude' },
      ],
    },
  ] as any);

  // Extract task options
  const taskChoices = tasksFile.aiTasks.map((task, index) => ({
    name: `${task.type}: ${task.prompt}`,
    value: index,
    checked: false,
  }));

  // Provide command line interaction using Inquirer.js
  const { selectedTasks } = await inquirer.prompt<SelectedTasksPrompt>([
    {
      type: 'checkbox',
      message: action === 'select' ? 'Select tasks to run' : 'Select tasks to exclude',
      name: 'selectedTasks',
      choices: taskChoices,
    },
  ] as any);

  if (action === 'select') {
    // Retain tasks based on user selection
    tasksFile.aiTasks = tasksFile.aiTasks.filter((_, index) => selectedTasks.includes(index));
  } else if (action === 'exclude') {
    // Exclude tasks based on user selection
    tasksFile.aiTasks = tasksFile.aiTasks.filter((_, index) => !selectedTasks.includes(index));
  }

  // Write the updated tasks back to the JSON file
  writeJsonFile(filePath, tasksFile);

  console.log('Task file updated:', filePath);
  console.log('Current task list:');
  console.log(formatTasks(tasksFile.aiTasks));
};

// // Execute the main function
// main().catch((error) => {
//   console.error('An error occurred:', error);
// });
