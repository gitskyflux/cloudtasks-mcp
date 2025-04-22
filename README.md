# Cloud Tasks MCP Server
[![smithery badge](https://smithery.ai/badge/@gitskyflux/cloudtasks-mcp)](https://smithery.ai/server/@gitskyflux/cloudtasks-mcp)

A Model Context Protocol (MCP) server for Google Cloud Tasks that enables interactions with Google Cloud Tasks queues and tasks.

## Features

- List Cloud Tasks queues in a specified location
- Get details of a specific queue
- Pause and resume queues
- List tasks in a queue
- Get details of a specific task
- Delete tasks from a queue

## Setup

### Installing via Smithery

To install Cloud Tasks Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@gitskyflux/cloudtasks-mcp):

```bash
npx -y @smithery/cli install @gitskyflux/cloudtasks-mcp --client claude
```

### Manual Installation

1. **Install dependencies**:
   ```
   npm install
   ```

2. **Build the project**:
   ```
   npm run build
   ```

3. **Configure Claude Desktop**:
   Add the following to your `claude_desktop_config.json`:

   ```json
   "cloudtasks-mcp": {
     "command": "node",
     "args": [
       "/path/to/cloudtasks-mcp/build/index.js"
     ],
     "env": {
       "GOOGLE_CLOUD_LOCATION_PROJECTS": "location:project-id"
     }
   }
   ```

   Replace the path in args with the actual path to index.js.
   
   Define a comma-separated list of `location:project-id` pairs in GOOGLE_CLOUD_LOCATION_PROJECTS.
   Example: `us-east1:google-project-id1,us-central1:google-project-id2`
   The first listed project is the default.
   
   The application expects to find .json credential file(s) in the keys folder for each project.
   Example: keys/google-project-id1.json
   
   Ensure the relevant cloud service account has appropriate permission to interact with Cloud Tasks, e.g. `Cloud Tasks Admin` or lesser permission(s).

### Available Tools

- `listQueues`: List all Cloud Tasks queues in a specified location
- `getQueue`: Get details of a specific Cloud Tasks queue
- `pauseQueue`: Pause a Cloud Tasks queue
- `resumeQueue`: Resume a paused Cloud Tasks queue
- `listTasks`: List tasks in a Cloud Tasks queue
- `getTask`: Get details of a specific task in a Cloud Tasks queue
- `deleteTask`: Delete a task from a Cloud Tasks queue

## Example Usage in Claude Desktop

Here are examples of how to use each tool in Claude Desktop:

### Pause or Resume a Queue

```
Pause the special-events queue. Resume the special-events queue.
```

### Get Pending Tasks

```
How many tasks are currently pending in the special-events queue?
```

### Run a Task in a Paused Queue

```
Run the task ending with the ID 123456 in the special-events queue.
```

## Development

```bash
# Watch mode
npm run dev
```
