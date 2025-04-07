#!/usr/bin/env node

/**
 * Cloud Tasks MCP Server
 * 
 * This server provides a Model Context Protocol interface for Google Cloud Tasks.
 * 
 * Environment variables:
 * - GOOGLE_CLOUD_LOCATION_PROJECTS: Comma-separated list of location:project-id pairs
 *   Example: "us-east1:google-project-id1,us-central1:google-project-id2"
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { CloudTasksClient } from "@google-cloud/tasks";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Get the directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.resolve(__dirname, "..", "keys");

// Parse location:project pairs from GOOGLE_CLOUD_LOCATION_PROJECTS environment variable
type LocationProject = {
    location: string;
    project: string;
};

// Default location
const DEFAULT_LOCATION = 'us-east1';

// Parse location:project pairs
const locationProjects: LocationProject[] = process.env.GOOGLE_CLOUD_LOCATION_PROJECTS ? 
    process.env.GOOGLE_CLOUD_LOCATION_PROJECTS.split(',')
        .map(pair => {
            const [location, project] = pair.trim().split(':');
            return { location, project };
        })
        .filter(pair => pair.location && pair.project) : 
    [];

// Default project is the first one in the list (if any)
const DEFAULT_PROJECT = locationProjects.length > 0 ? locationProjects[0].project : '';

if (locationProjects.length === 0) {
    console.error("Warning: GOOGLE_CLOUD_LOCATION_PROJECTS environment variable is not set");
}

// Initialize a map to store Cloud Tasks clients for each project
const tasksClients: Record<string, CloudTasksClient> = {};

// Function to get Cloud Tasks client for a specific project
function getTasksClientForProject(projectId: string): CloudTasksClient {
    if (!tasksClients[projectId]) {
        throw new Error(`No Cloud Tasks client initialized for project: ${projectId}`);
    }
    return tasksClients[projectId];
}

// Initialize Cloud Tasks client for each project
for (const { project } of locationProjects) {
    try {
        // Construct key path based on project ID
        const keyPath = path.resolve(keysDir, `${project}.json`);
        
        if (!fs.existsSync(keyPath)) {
            console.error(`Warning: No credentials file found for project ${project} at ${keyPath}`);
            continue;
        }
        
        // Read and parse the service account key file
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        
        // Initialize Cloud Tasks client
        tasksClients[project] = new CloudTasksClient({
            credentials: serviceAccount
        });
        
        console.error(`Google Cloud Tasks client initialized successfully for project: ${project}`);
    } catch (error) {
        console.error(`Error initializing Google Cloud Tasks client for project ${project}:`, error);
    }
}

// Check if at least one project was successfully initialized
if (Object.keys(tasksClients).length === 0) {
    console.error("Error: Failed to initialize any Google Cloud Tasks clients. Exiting.");
    process.exit(1);
}

// Create MCP server
const server = new Server(
    {
        name: "cloudtasks",
        version: "1.0.0"
    },
    {
        capabilities: {
            tools: {
                listChanged: false
            }
        }
    }
);

// Helper function to get location for a project
function getLocationForProject(project: string): string {
    const found = locationProjects.find(lp => lp.project === project);
    return found ? found.location : DEFAULT_LOCATION;
}

// Define empty schema for tools that don't require arguments
const EmptySchema = z.object({});

// Schema definitions
const ProjectSchema = z.object({
    project: z.string().min(1).optional().default(DEFAULT_PROJECT),
    location: z.string().min(1).optional()
}).refine(data => !!data.project, {
    message: "Project ID is required. Provide it in the request or set GOOGLE_CLOUD_LOCATION_PROJECTS environment variable.",
    path: ["project"]
}).transform(data => {
    // If location is not provided, look it up from the location:project pairs
    if (!data.location) {
        data.location = getLocationForProject(data.project);
    }
    return data;
});

const QueueSchema = z.object({
    project: z.string().min(1).optional().default(DEFAULT_PROJECT),
    location: z.string().min(1).optional(),
    queue: z.string().min(1)
}).refine(data => !!data.project, {
    message: "Project ID is required. Provide it in the request or set GOOGLE_CLOUD_LOCATION_PROJECTS environment variable.",
    path: ["project"]
}).transform(data => {
    // If location is not provided, look it up from the location:project pairs
    if (!data.location) {
        data.location = getLocationForProject(data.project);
    }
    return data;
});

const TaskSchema = z.object({
    project: z.string().min(1).optional().default(DEFAULT_PROJECT),
    location: z.string().min(1).optional(),
    queue: z.string().min(1),
    task: z.string().min(1)
}).refine(data => !!data.project, {
    message: "Project ID is required. Provide it in the request or set GOOGLE_CLOUD_LOCATION_PROJECTS environment variable.",
    path: ["project"]
}).transform(data => {
    // If location is not provided, look it up from the location:project pairs
    if (!data.location) {
        data.location = getLocationForProject(data.project);
    }
    return data;
});

// Helper to format parent for queues
function formatQueueParent(project: string, location: string): string {
    return `projects/${project}/locations/${location}`;
}

// Helper to format parent for tasks
function formatTaskParent(project: string, location: string, queue: string): string {
    return `projects/${project}/locations/${location}/queues/${queue}`;
}

// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "listQueues",
                description: "List all Cloud Tasks queues in a specified location",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_LOCATION_PROJECTS env var)"
                        },
                        location: {
                            type: "string",
                            description: "Google Cloud location (defaults to location from GOOGLE_CLOUD_LOCATION_PROJECTS or 'us-east1')"
                        }
                    }
                }
            },
            {
                name: "getQueue",
                description: "Get details of a specific Cloud Tasks queue",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_LOCATION_PROJECTS env var)"
                        },
                        location: {
                            type: "string",
                            description: "Google Cloud location (defaults to location from GOOGLE_CLOUD_LOCATION_PROJECTS or 'us-east1')"
                        },
                        queue: {
                            type: "string",
                            description: "Name of the queue"
                        }
                    },
                    required: ["queue"]
                }
            },
            {
                name: "pauseQueue",
                description: "Pause a Cloud Tasks queue",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_LOCATION_PROJECTS env var)"
                        },
                        location: {
                            type: "string",
                            description: "Google Cloud location (defaults to location from GOOGLE_CLOUD_LOCATION_PROJECTS or 'us-east1')"
                        },
                        queue: {
                            type: "string",
                            description: "Name of the queue to pause"
                        }
                    },
                    required: ["queue"]
                }
            },
            {
                name: "resumeQueue",
                description: "Resume a paused Cloud Tasks queue",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_LOCATION_PROJECTS env var)"
                        },
                        location: {
                            type: "string",
                            description: "Google Cloud location (defaults to location from GOOGLE_CLOUD_LOCATION_PROJECTS or 'us-east1')"
                        },
                        queue: {
                            type: "string",
                            description: "Name of the queue to resume"
                        }
                    },
                    required: ["queue"]
                }
            },
            {
                name: "listTasks",
                description: "List tasks in a Cloud Tasks queue",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_LOCATION_PROJECTS env var)"
                        },
                        location: {
                            type: "string",
                            description: "Google Cloud location (defaults to location from GOOGLE_CLOUD_LOCATION_PROJECTS or 'us-east1')"
                        },
                        queue: {
                            type: "string",
                            description: "Name of the queue"
                        }
                    },
                    required: ["queue"]
                }
            },
            {
                name: "getTask",
                description: "Get details of a specific task in a Cloud Tasks queue",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_LOCATION_PROJECTS env var)"
                        },
                        location: {
                            type: "string",
                            description: "Google Cloud location (defaults to location from GOOGLE_CLOUD_LOCATION_PROJECTS or 'us-east1')"
                        },
                        queue: {
                            type: "string",
                            description: "Name of the queue"
                        },
                        task: {
                            type: "string",
                            description: "Name or ID of the task"
                        }
                    },
                    required: ["queue", "task"]
                }
            },
            {
                name: "deleteTask",
                description: "Delete a task from a Cloud Tasks queue",
                inputSchema: {
                    type: "object",
                    properties: {
                        project: {
                            type: "string",
                            description: "Google Cloud project ID (defaults to first project from GOOGLE_CLOUD_LOCATION_PROJECTS env var)"
                        },
                        location: {
                            type: "string",
                            description: "Google Cloud location (defaults to location from GOOGLE_CLOUD_LOCATION_PROJECTS or 'us-east1')"
                        },
                        queue: {
                            type: "string",
                            description: "Name of the queue"
                        },
                        task: {
                            type: "string",
                            description: "Name or ID of the task to delete"
                        }
                    },
                    required: ["queue", "task"]
                }
            },
            {
                name: "listLocationProjects",
                description: "List all available location:project pairs that have been configured",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            }
        ],
    };
});

// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "listQueues") {
            const { project, location } = ProjectSchema.parse(args);
            const parent = formatQueueParent(project!, location!);
            
            try {
                const client = getTasksClientForProject(project);
                const [queues] = await client.listQueues({ parent });
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(queues, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Failed to list queues",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "getQueue") {
            const { project, location, queue } = QueueSchema.parse(args);
            const queuePath = `projects/${project}/locations/${location}/queues/${queue}`;
            
            try {
                const client = getTasksClientForProject(project);
                const [queueDetails] = await client.getQueue({ name: queuePath });
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(queueDetails, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Queue not found or access denied",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "pauseQueue") {
            const { project, location, queue } = QueueSchema.parse(args);
            const queuePath = `projects/${project}/locations/${location}/queues/${queue}`;
            
            try {
                const client = getTasksClientForProject(project);
                // First get the queue to verify it exists
                await client.getQueue({ name: queuePath });
                
                const [pausedQueue] = await client.pauseQueue({ name: queuePath });
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            message: `Queue ${queue} paused successfully`,
                            state: pausedQueue.state
                        }, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Failed to pause queue",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "resumeQueue") {
            const { project, location, queue } = QueueSchema.parse(args);
            const queuePath = `projects/${project}/locations/${location}/queues/${queue}`;
            
            try {
                const client = getTasksClientForProject(project);
                // First get the queue to verify it exists
                await client.getQueue({ name: queuePath });
                
                const [resumedQueue] = await client.resumeQueue({ name: queuePath });
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            message: `Queue ${queue} resumed successfully`,
                            state: resumedQueue.state
                        }, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Failed to resume queue",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "listTasks") {
            const { project, location, queue } = QueueSchema.parse(args);
            const parent = formatTaskParent(project!, location!, queue);
            
            try {
                const client = getTasksClientForProject(project);
                const [tasks] = await client.listTasks({ parent });
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(tasks, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Failed to list tasks",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "getTask") {
            const { project, location, queue, task } = TaskSchema.parse(args);
            const taskPath = `projects/${project}/locations/${location}/queues/${queue}/tasks/${task}`;
            
            try {
                const client = getTasksClientForProject(project);
                const [taskDetails] = await client.getTask({ name: taskPath });
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(taskDetails, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Task not found or access denied",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "deleteTask") {
            const { project, location, queue, task } = TaskSchema.parse(args);
            const taskPath = `projects/${project}/locations/${location}/queues/${queue}/tasks/${task}`;
            
            try {
                const client = getTasksClientForProject(project);
                await client.deleteTask({ name: taskPath });
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            success: true,
                            message: `Task ${task} deleted successfully from queue ${queue}`
                        }, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({ 
                            error: "Failed to delete task",
                            message: (error as Error).message
                        }, null, 2) 
                    }]
                };
            }
        }
        else if (name === "listLocationProjects") {
            EmptySchema.parse(args);
            
            // Return information about location:project pairs and default settings
            return {
                content: [{ 
                    type: "text", 
                    text: JSON.stringify({
                        locationProjects,
                        defaultProject: DEFAULT_PROJECT,
                        defaultLocation: DEFAULT_LOCATION,
                        initializedProjects: Object.keys(tasksClients),
                        currentEnv: process.env.GOOGLE_CLOUD_LOCATION_PROJECTS || "Not set"
                    }, null, 2) 
                }]
            };
        }
        else {
            throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                content: [{ 
                    type: "text", 
                    text: JSON.stringify({
                        error: "Invalid arguments",
                        details: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")
                    }, null, 2)
                }]
            };
        }
        
        return {
            content: [{ 
                type: "text", 
                text: JSON.stringify({
                    error: "Internal server error",
                    message: (error as Error).message
                }, null, 2)
            }]
        };
    }
});

// Start the server
async function main() {
    try {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Cloud Tasks MCP Server running on stdio");
    } catch (error) {
        console.error("Error during startup:", error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});