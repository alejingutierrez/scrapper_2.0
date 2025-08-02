document.addEventListener('DOMContentLoaded', () => {
    const domainsInput = document.getElementById('domains-input');
    const startBtn = document.getElementById('start-scrape-btn');
    const jobStatus = document.getElementById('job-status');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const pauseBtn = document.getElementById('pause-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const stopBtn = document.getElementById('stop-btn');
    const downloadBtn = document.getElementById('download-btn');
    const resultsBody = document.querySelector('#results-table tbody');

    const API_BASE_URL = ''; // Las peticiones serán relativas al host actual
    let intervalId = null;
    let currentTaskId = null;

    startBtn.addEventListener('click', async () => {
        const domains = domainsInput.value.trim().split('\n').filter(d => d);
        if (domains.length === 0) {
            alert('Por favor, introduce al menos un dominio.');
            return;
        }

        startBtn.disabled = true;
        jobStatus.textContent = 'Iniciando trabajo...';
        progressBar.style.width = '0%';
        progressText.textContent = '';

        try {
            const response = await fetch(`${API_BASE_URL}/scrape`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ domains }),
            });

            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.statusText}`);
            }

            const data = await response.json();
            currentTaskId = data.task_id;
            jobStatus.textContent = `Trabajo en progreso (ID: ${currentTaskId})`;
            pauseBtn.disabled = false;
            stopBtn.disabled = false;
            downloadBtn.disabled = false;

            // Empezar a consultar el estado
            intervalId = setInterval(() => checkStatus(currentTaskId), 2000);

        } catch (error) {
            jobStatus.textContent = `Error al iniciar: ${error.message}`;
            startBtn.disabled = false;
        }
    });

    pauseBtn.addEventListener('click', async () => {
        if (!currentTaskId) return;
        await fetch(`${API_BASE_URL}/scrape/pause/${currentTaskId}`, { method: 'POST' });
        pauseBtn.disabled = true;
        resumeBtn.disabled = false;
    });

    resumeBtn.addEventListener('click', async () => {
        if (!currentTaskId) return;
        await fetch(`${API_BASE_URL}/scrape/resume/${currentTaskId}`, { method: 'POST' });
        pauseBtn.disabled = false;
        resumeBtn.disabled = true;
        intervalId = setInterval(() => checkStatus(currentTaskId), 2000);
    });

    stopBtn.addEventListener('click', async () => {
        if (!currentTaskId) return;
        await fetch(`${API_BASE_URL}/scrape/stop/${currentTaskId}`, { method: 'POST' });
        clearInterval(intervalId);
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        stopBtn.disabled = true;
    });

    downloadBtn.addEventListener('click', async () => {
        if (!currentTaskId) return;
        const response = await fetch(`${API_BASE_URL}/scrape/download/${currentTaskId}`);
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentTaskId}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    async function checkStatus(taskId) {
        const progressDetails = document.getElementById('progress-details');
        try {
            const response = await fetch(`${API_BASE_URL}/scrape/status/${taskId}`);
            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();

            jobStatus.textContent = `Estado del trabajo: ${data.status}`;
            if (data.status === 'PAUSED') {
                pauseBtn.disabled = true;
                resumeBtn.disabled = false;
            }

            if (data.progress) {
                const { total, completed, success, failed, percent } = data.progress;
                progressBar.style.width = percent;
                progressText.textContent = `${completed} de ${total} URLs procesadas (${percent})`;

                progressDetails.style.display = 'block';
                progressDetails.innerHTML = `
                    <span>Total: <strong>${total}</strong></span>
                    <span>Completadas: <strong>${completed}</strong></span>
                    <span class="success">Éxitos: <strong>${success}</strong></span>
                    <span class="failure">Fallos: <strong>${failed}</strong></span>
                `;
            }

            // actualizar tabla de resultados
            const res = await fetch(`${API_BASE_URL}/scrape/results/${taskId}`);
            const resData = await res.json();
            resultsBody.innerHTML = '';
            resData.results.forEach(r => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${r.url}</td><td>${r.status}</td>`;
                resultsBody.appendChild(tr);
            });

            if (['SUCCESS', 'FAILURE', 'COMPLETED', 'CANCELLED'].includes(data.status)) {
                clearInterval(intervalId);
                startBtn.disabled = false;
                pauseBtn.disabled = true;
                resumeBtn.disabled = true;
                stopBtn.disabled = true;
                jobStatus.textContent = `Trabajo finalizado con estado: ${data.status}`;
            }

        } catch (error) {
            console.error('Error al consultar el estado:', error);
            jobStatus.textContent = 'Error al consultar estado. Revisa la consola.';
            progressDetails.style.display = 'none';
            clearInterval(intervalId);
            startBtn.disabled = false;
        }
    }
});
