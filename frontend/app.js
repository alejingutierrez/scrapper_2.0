document.addEventListener('DOMContentLoaded', () => {
    const domainsInput = document.getElementById('domains-input');
    const startBtn = document.getElementById('start-scrape-btn');
    const jobStatus = document.getElementById('job-status');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    const API_BASE_URL = ''; // Las peticiones serán relativas al host actual
    let intervalId = null;

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
            const taskId = data.task_id;
            jobStatus.textContent = `Trabajo en progreso (ID: ${taskId})`;
            
            // Empezar a consultar el estado
            intervalId = setInterval(() => checkStatus(taskId), 2000);

        } catch (error) {
            jobStatus.textContent = `Error al iniciar: ${error.message}`;
            startBtn.disabled = false;
        }
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

            if (data.status === 'SUCCESS' || data.status === 'FAILURE') {
                clearInterval(intervalId);
                startBtn.disabled = false;
                jobStatus.textContent = `Trabajo finalizado con estado: ${data.status}`;
                if (data.status === 'SUCCESS') {
                    progressBar.style.backgroundColor = '#28a745';
                } else {
                    progressBar.style.backgroundColor = '#dc3545';
                }
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
