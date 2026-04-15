/**
 * Utility: Scan GitHub for images and update lots.json
 * Run this once after deploying, or when you upload screenshots via GitHub UI
 */

async function scanAndUpdateImagesInGitHub() {
  const GH_TOKEN = localStorage.getItem('wotshop-gh-token');
  const GH_REPO = localStorage.getItem('wotshop-gh-repo');
  const GH_BRANCH = localStorage.getItem('wotshop-gh-branch') || 'main';

  if (!GH_TOKEN || !GH_REPO) {
    console.error('GitHub not configured. Set token and repo in admin settings.');
    return;
  }

  const API = 'https://api.github.com';

  try {
    // Fetch lots.json
    const lotsRes = await fetch(
      `${API}/repos/${GH_REPO}/contents/data/lots.json?ref=${GH_BRANCH}`,
      { headers: { 'Authorization': `Bearer ${GH_TOKEN}` } }
    );

    if (!lotsRes.ok) {
      console.error('Failed to fetch lots.json:', lotsRes.status);
      return;
    }

    const lotsData = await lotsRes.json();
    let lotsJson = JSON.parse(atob(lotsData.content));
    console.log('Loaded lots.json with', Object.keys(lotsJson).length, 'items');

    // Fetch contents of images/lots/ directory
    const imagesRes = await fetch(
      `${API}/repos/${GH_REPO}/contents/images/lots?ref=${GH_BRANCH}`,
      { headers: { 'Authorization': `Bearer ${GH_TOKEN}` } }
    );

    if (!imagesRes.ok) {
      console.warn('images/lots directory not found:', imagesRes.status);
      return;
    }

    const imagesDirContent = await imagesRes.json();
    console.log('Found', Array.isArray(imagesDirContent) ? imagesDirContent.length : 0, 'items in images/lots/');

    // Process each ID directory
    if (!Array.isArray(imagesDirContent)) {
      console.error('Expected array of items in images/lots/');
      return;
    }

    for (const idDirEntry of imagesDirContent) {
      if (idDirEntry.type !== 'dir') continue;

      const id = idDirEntry.name;
      console.log(`\nProcessing images for ID: ${id}`);

      // Fetch files in this ID's directory
      const filesRes = await fetch(
        `${API}/repos/${GH_REPO}/contents/images/lots/${id}?ref=${GH_BRANCH}`,
        { headers: { 'Authorization': `Bearer ${GH_TOKEN}` } }
      );

      if (!filesRes.ok) {
        console.warn(`Failed to fetch images for ${id}:`, filesRes.status);
        continue;
      }

      const filesContent = await filesRes.json();
      if (!Array.isArray(filesContent)) continue;

      // Separate thumbnail and images
      const files = filesContent
        .filter(f => f.type === 'file' && (f.name.endsWith('.webp') || f.name.endsWith('.jpg')))
        .map(f => f.path);

      let thumb = null;
      const images = [];

      for (const path of files) {
        if (path.includes('/thumb.')) {
          thumb = path;
        } else {
          images.push(path);
        }
      }

      // Sort images by number (if applicable)
      images.sort((a, b) => {
        const aNum = parseInt(a.match(/(\d+)\.\w+/)?.[1] || '0');
        const bNum = parseInt(b.match(/(\d+)\.\w+/)?.[1] || '0');
        return aNum - bNum;
      });

      if (lotsJson[id]) {
        lotsJson[id].images = images;
        lotsJson[id].thumb = thumb || (images.length > 0 ? images[0] : null);
        console.log(`  ✓ Updated: ${images.length} images, thumb: ${thumb || images[0] || 'none'}`);
      } else {
        console.warn(`  ⚠️ ID ${id} not found in lots.json`);
      }
    }

    // Update lots.json on GitHub
    const updatedContent = btoa(JSON.stringify(lotsJson, null, 2));
    const updateRes = await fetch(
      `${API}/repos/${GH_REPO}/contents/data/lots.json`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${GH_TOKEN}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          message: 'Scan and update images in lots.json',
          content: updatedContent,
          sha: lotsData.sha,
          branch: GH_BRANCH
        })
      }
    );

    if (updateRes.ok) {
      console.log('\n✅ Successfully updated lots.json with scanned images');
    } else {
      const err = await updateRes.json();
      console.error('Failed to update lots.json:', err);
    }
  } catch (e) {
    console.error('Error scanning images:', e);
  }
}

// Run this in browser console:
// scanAndUpdateImagesInGitHub()

// Or call this function from somewhere in your code
