import fetch from 'node-fetch';
import fs from 'fs';

async function getLatestDockerVersion() {
  const response = await fetch('https://hub.docker.com/v2/repositories/allbridge/io.allbridge.rest-api/tags/');
  const data = await response.json();

  const tags = data.results.map(tag => tag.name);
  const versionTags = tags.filter(tag => tag !== 'latest' && /^\d+\.\d+\.\d+$/.test(tag));

  if (versionTags.length === 0) {
    throw new Error('No version tags found');
  }

  versionTags.sort((a, b) => {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < aParts.length; i++) {
      if (aParts[i] > bParts[i]) return -1;
      if (aParts[i] < bParts[i]) return 1;
    }
    return 0;
  });

  const latestVersion = versionTags[0];
  console.log(`VERSION=${latestVersion}`);
  fs.writeFileSync('version.txt', latestVersion);
  return latestVersion;
}

getLatestDockerVersion().catch((error) => {
  console.error(error);
  process.exit(1);
});
