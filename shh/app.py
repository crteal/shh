"""
This module provides a FastAPI server application for chatting with a LLM
"""
import asyncio
import base64
import io
import json
import os

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from faster_whisper import WhisperModel, BatchedInferencePipeline
from ollama import AsyncClient
import torch

history = []

LLM_MODEL = os.environ.get('LLM_MODEL', 'gemma3:latest')
TRANSCRIPTION_MODEL = os.environ.get('TRANSCRIPTION_MODEL', 'turbo')

TRANSCRIPTION_DEVICE_CPU = 'cpu'
TRANSCRIPTION_DEVICE_GPU = 'cuda'
TRANSCRIPTION_DEVICE_CPU_COMPUTE_TYPE = 'int8'
TRANSCRIPTION_DEVICE_GPU_COMPUTE_TYPE = 'float16'
TRANSCRIPTION_BATCH_SIZE = 16


def is_cuda_available():
    """Returns true if Compute Unified Defice Architecture (CUDA) is available"""
    return torch.cuda.is_available()


def get_transcription_device():
    """Gets the device for the transcription model"""
    detected_device = TRANSCRIPTION_DEVICE_GPU if is_cuda_available() else TRANSCRIPTION_DEVICE_CPU
    transcription_device = os.environ.get('TRANSCRIPTION_DEVICE', detected_device)
    return transcription_device


def get_transcription_compute_type():
    """Gets the compute type for the transcription model"""
    detected_compute_type = TRANSCRIPTION_DEVICE_GPU_COMPUTE_TYPE if is_cuda_available() else TRANSCRIPTION_DEVICE_CPU_COMPUTE_TYPE
    transcription_compute_type = os.environ.get('TRANSCRIPTION_COMPUTE_TYPE', detected_compute_type)
    return transcription_compute_type


def get_transcription_batch_size():
    """Gets the batch size for transcription"""
    batch_size = os.environ.get('TRANSCRIPTION_BATCH_SIZE', TRANSCRIPTION_BATCH_SIZE)
    return batch_size


async def transcribe_audio(model, audio):
    """Transcribes a audio (in base64) with the given model"""
    binary_io = io.BytesIO(base64.b64decode(audio))
    segments, _ = model.transcribe(
        binary_io,
        batch_size=get_transcription_batch_size()
    )
    return ''.join(list(map(lambda segment: segment.text, segments)))


async def audio_to_chat(queue, model, audio):
    """Transcribes audio into text, and supplies it to the LLM"""
    message = await transcribe_audio(model, audio)

    history.append({
        'role': 'user',
        'content': message
    })

    await llm_chat(queue, messages=history)


async def llm_chat(queue, **kwargs):
    """Asynchronously chats with a model via Ollama"""
    chunks = []

    model = kwargs.get('model', LLM_MODEL)
    messages = kwargs.get('messages', [])

    async for chunk in await AsyncClient().chat(
        model=model,
        messages=messages,
        stream=True
    ):
        chunks.append(chunk.message.content)
        if chunk.done:
            history.append({
                'role': 'assistant',
                'content': ''.join(chunks)
            })

        queue.put_nowait(json.dumps({
            'content': chunk.message.content,
            'done': chunk.done
        }))


async def chat_generator(queue, request: Request):
    """A generator producing an event stream corresponding to a chat"""
    while True:
        if await request.is_disconnected():
            break
        chunk = await queue.get()
        yield f"event: message\ndata: {chunk}\n\n"
        queue.task_done()


def App(**kwargs):
    """A FastAPI application providing text and audio chat capabilities"""
    app = FastAPI()
    queue = asyncio.Queue()

    model = WhisperModel(
        TRANSCRIPTION_MODEL,
        device=get_transcription_device(),
        compute_type=get_transcription_compute_type()
    )

    batched_model = BatchedInferencePipeline(model=model)

    @app.post('/chat')
    async def chat(
        background_tasks: BackgroundTasks,
        request: Request
    ) -> None:
        message = await request.json()
        message_type = message.get('type')

        if message_type == 'audio':
            background_tasks.add_task(
                audio_to_chat,
                queue,
                batched_model,
                message.get('data')
            )
            return

        if message_type == 'text':
            history.append({
                'role': 'user',
                'content': message.get('data')
            })

            background_tasks.add_task(llm_chat, queue, messages=history)

    @app.get('/chat')
    async def chat_sse(
        request: Request
    ):
        return StreamingResponse(
            chat_generator(queue, request),
            media_type='text/event-stream'
        )

    app.mount('/', StaticFiles(directory='./www', html=True), name='www')

    return app
