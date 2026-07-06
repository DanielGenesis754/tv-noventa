const videoSources = {
    programas: 'linksPropagandas.json',
    desenhos: 'linksDesenhos.json',
    filmes: 'linksFilmes.json'
};

const videoLists = {
    programas: [],
    desenhos: [],
    filmes: []
};

let isPlaybackOn = false;
let lastVideoUrl = null;
let videosLoaded = false;

async function loadVideoList(source) {
    const response = await fetch(source, { cache: 'no-store' });

    if (!response.ok) {
        throw new Error(`Nao foi possivel carregar ${source}: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.videos)) {
        throw new Error(`${source} precisa ter o formato { "videos": [...] }`);
    }

    return data.videos;
}

async function loadAllVideoLists() {
    const entries = await Promise.all(
        Object.entries(videoSources).map(async ([category, source]) => {
            const videos = await loadVideoList(source);
            return [category, videos];
        })
    );

    entries.forEach(([category, videos]) => {
        videoLists[category] = videos;
    });

    videosLoaded = true;
}

function getRandomVideo(videosArray) {
    if (videosArray.length === 0) {
        return null;
    }

    let nextVideoUrl;

    do {
        nextVideoUrl = videosArray[Math.floor(Math.random() * videosArray.length)];
    } while (videosArray.length > 1 && nextVideoUrl === lastVideoUrl);

    return nextVideoUrl;
}

function getSelectedVideos() {
    let selectedVideos = [];

    if (document.getElementById('programasCheckbox').checked) {
        selectedVideos = selectedVideos.concat(videoLists.programas);
    }

    if (document.getElementById('desenhosCheckbox').checked) {
        selectedVideos = selectedVideos.concat(videoLists.desenhos);
    }

    if (document.getElementById('filmesCheckbox').checked) {
        selectedVideos = selectedVideos.concat(videoLists.filmes);
    }

    return selectedVideos;
}

function playNextVideo() {
    if (!videosLoaded) {
        return;
    }

    const videoFrame = document.getElementById('video-frame');
    const nextVideoUrl = getRandomVideo(getSelectedVideos());

    if (!nextVideoUrl) {
        return;
    }

    const staticDiv = document.createElement('div');
    staticDiv.classList.add('static');
    videoFrame.appendChild(staticDiv);

    setTimeout(() => {
        videoFrame.innerHTML = '';

        const iframe = document.createElement('iframe');
        iframe.width = '100%';
        iframe.height = '100%';
        iframe.src = nextVideoUrl;
        iframe.title = 'YouTube video player';
        iframe.frameBorder = '0';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.allowFullscreen = true;

        videoFrame.appendChild(iframe);

        staticDiv.classList.add('hidden');
        setTimeout(() => {
            if (staticDiv.parentElement) {
                staticDiv.remove();
            }
        }, 500);
    }, 1000);

    lastVideoUrl = nextVideoUrl;
}

function togglePlayback() {
    const togglePlaybackButton = document.getElementById('togglePlayback');
    const videoFrame = document.getElementById('video-frame');

    if (isPlaybackOn) {
        videoFrame.innerHTML = '';
        togglePlaybackButton.innerText = 'Ligar TV';
        isPlaybackOn = false;
        return;
    }

    playNextVideo();
    togglePlaybackButton.innerText = 'Desligar TV';
    isPlaybackOn = true;
}

function updatePlaybackButtonVisibility() {
    const togglePlaybackButton = document.getElementById('togglePlayback');
    const nextVideoButton = document.getElementById('nextVideo');
    const hasSelectedCategory = document.getElementById('programasCheckbox').checked
        || document.getElementById('desenhosCheckbox').checked
        || document.getElementById('filmesCheckbox').checked;
    const shouldEnableButtons = videosLoaded && hasSelectedCategory;

    togglePlaybackButton.disabled = !shouldEnableButtons;
    nextVideoButton.disabled = !shouldEnableButtons;
}

function showVideoLoadError(error) {
    console.error(error);
    console.info('Se voce abriu o index.html direto como arquivo, rode um servidor local. Exemplo: python -m http.server 8000');

    document.getElementById('togglePlayback').innerText = 'Erro nos links';
    updatePlaybackButtonVisibility();
}

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('togglePlayback').disabled = true;
    document.getElementById('nextVideo').disabled = true;

    document.getElementById('programasCheckbox').addEventListener('change', updatePlaybackButtonVisibility);
    document.getElementById('desenhosCheckbox').addEventListener('change', updatePlaybackButtonVisibility);
    document.getElementById('filmesCheckbox').addEventListener('change', updatePlaybackButtonVisibility);
    document.getElementById('togglePlayback').addEventListener('click', togglePlayback);
    document.getElementById('nextVideo').addEventListener('click', () => {
        if (isPlaybackOn) {
            playNextVideo();
        }
    });

    try {
        await loadAllVideoLists();
        updatePlaybackButtonVisibility();
    } catch (error) {
        showVideoLoadError(error);
    }
});
