import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { Embeddings } from '@langchain/core/embeddings';
import { AzureCosmosDBNoSQLVectorStore } from '@langchain/azure-cosmosdb';
import { BaseChatModel } from '@langchain/core/language_models/chat_models'; // Not strictly needed for this script, but good for context
import { VectorStore } from '@langchain/core/vectorstores';
import { OllamaEmbeddings } from '@langchain/ollama';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import 'dotenv/config'; // To load environment variables
import { Document } from '@langchain/core/documents';
import { getAzureOpenAiTokenProvider, getCredentials } from '../security.js'; // Adjust path if needed
import { ollamaEmbeddingsModel, faissStoreFolder } from '../constants.js'; // Adjust path if needed

// Must be run from /api

async function retrieveDocuments(query: string, k = 5) {
  const azureOpenAiEndpoint = process.env.AZURE_OPENAI_API_ENDPOINT;

  let embeddings: Embeddings;
  let store: VectorStore;

  console.log('Initializing vector store...');

  if (azureOpenAiEndpoint) {
    // Azure Cosmos DB setup
    const credentials = getCredentials();
    const azureADTokenProvider = getAzureOpenAiTokenProvider();

    embeddings = new AzureOpenAIEmbeddings({ azureADTokenProvider });
    store = new AzureCosmosDBNoSQLVectorStore(embeddings, { credentials });
    console.log('Using Azure Cosmos DB NoSQL Vector Store.');
  } else {
    // Local Ollama + FAISS setup
    console.log('No Azure OpenAI endpoint set, using Ollama Embeddings and local FAISS store.');
    embeddings = new OllamaEmbeddings({ model: ollamaEmbeddingsModel });
    try {
      store = await FaissStore.load(faissStoreFolder, embeddings);
    } catch {
      console.error(
        `Error loading FAISS store from ${faissStoreFolder}. Make sure it exists and contains embeddings. You might need to run your ingestion script first.`,
      );
      throw new Error('Failed to load FAISS store.');
    }

    console.log('Using local FAISS Store.');
  }

  // Create the retriever with the specified number of top results (k)
  const retriever = store.asRetriever(k);

  console.log(`Searching for top ${k} documents similar to: "${query}"`);

  // Invoke the retriever with your query
  const results: Document[] = await retriever.invoke(query);

  console.log('\n--- Retrieved Documents ---');
  if (results.length === 0) {
    console.log('No documents found for this query.');
  } else {
    for (const [index, document] of results.entries()) {
      console.log(`\n--- Document ${index + 1} ---`);
      console.log(
        'Page Content (first 500 chars):\n',
        document.pageContent.slice(0, 500) + (document.pageContent.length > 500 ? '...' : ''),
      );
      console.log('Metadata:\n', document.metadata);
      // If you want to see the full content, remove .substring(0, 500)
    }
  }

  console.log('\n---------------------------\n');
}

// --- START OF MODIFICATION ---

// Main execution block - Refactored to use top-level await
// Remove the async function main() wrapper
const arguments_ = process.argv.slice(2); // Get command-line arguments

if (arguments_.length === 0) {
  console.log('Usage: ts-node retrieve-docs.ts "<your query>" [number_of_results]');
  console.log('Example: ts-node retrieve-docs.ts "reclamaciones sobre pliegos" 3');
  // Throwing an error for missing arguments, as it's an invalid usage.
  throw new Error('Missing command-line arguments.');
}

const userQuery = arguments_[0];
// Use Number.parseInt for clarity, although global parseInt works similarly here
const numberOfResults = arguments_.length > 1 ? Number.parseInt(arguments_[1], 10) : 5; // Default to 5 results

if (Number.isNaN(numberOfResults) || numberOfResults <= 0) {
  console.error('Error: number_of_results must be a positive number.');
  throw new Error('Invalid number of results provided.');
}

try {
  // Directly await the asynchronous function
  await retrieveDocuments(userQuery, numberOfResults);
} catch (error) {
  console.error('An error occurred during retrieval:', error);
  // Re-throw the error so the process exits with a non-zero code if an error occurs.
  throw error;
}

// --- END OF MODIFICATION ---
