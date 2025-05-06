# shh

![Image of Elmer Fudd with finger to lips](https://westernagnetwork.com/images/img_3nryoLdnfeNcSvDUEZD5Eo/elmer-fudd.jpg?fit=outside&w=1600)

An experimental generative Artificial Intelligence (AI) chat interface, powered by the Ollama API, supporting Automatic Speech Recognition (ASR) using [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

## Requirements

* Node Package Manager (NPM) 11.3.0 or greater
* Ollama 0.6.7 or greater
* Python 3.9 or greater

By default, unless an override is specified via the `LLM_MODEL` environment variable, Ollama will load the `gemma3:latest` model. Currently, this must be done manually, and can be achieved using the Ollama command line interface ahead of running the server via...

```bash
ollama pull gemma3:latest
```

...by default, unless an override is specified via the `TRANSCRIPTION_MODEL` environment variable, `faster-whisper` will use the `turbo` model. Unlike above, this model will be downloaded automatically before the server starts.

## Installation

Clone this repository locally via...

```bash
git clone git@github.com:crteal/shh.git
```

## Run

From the root of the repository, create a Python virtual environment (e.g., `uv venv`), activate it, install Python dependencies (e.g., `uv sync`), install Node dependencies (e.g., `npm install`), compile Tailwind (e.g., `npm run build`), then type...

```bash
fastapi run
```

...which will start the FastAPI server at [http://localhost:8000](http://localhost:8000).
