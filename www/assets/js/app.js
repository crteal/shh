(function (marked) {

  'use strict';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('getUserMedia unsupported');
    return;
  }

  const messages = document.querySelector('#messages');

  function createMessageElement(owner) {
    const isSelf = (owner === 'self');
    const el = document.createElement('div');

    el.classList.add(
      'border-2',
      (isSelf ? 'border-blue-200' : 'border-slate-200'),
      'border-solid',
      'max-w-9/10',
      'p-3',
      'rounded-xl'
    );

    if (owner === 'self') {
      el.classList.add('bg-blue-100', 'self-end');
    }

    return el;
  }

  function addMessage(owner, data) {
    const el = createMessageElement(owner);
    el.innerHTML = marked.parse(data.text);
    messages.append(el);
    requestAnimationFrame(() => el.scrollIntoView());
  }

  function addAudioMessage(owner, url) {
    const el = createMessageElement(owner);

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.setAttribute('controls', '');
    audio.src = url;
    el.append(audio)

    messages.append(el);

    requestAnimationFrame(() => el.scrollIntoView());
  }

  function createEventSource() {
    let chunks = [];
    const eventSource = new EventSource('/chat');

    eventSource.onopen = () => {
      console.log(eventSource, 'open');
    };

    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      chunks.push(data.content);
      if (data.done) {
        addMessage('partner', {text: chunks.join('')});
        chunks = [];
      }
    };

    eventSource.onerror = (error) => {
      console.error(`error encountered from eventSource: ${err}`);
      eventSource.close();
    };

    return eventSource;
  }

  const messageButton = document.querySelector('#message-button');

  function createMediaRecorder(stream) {
    let chunks = [];
    const mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      chunks.push(e.data);
    };

    mediaRecorder.onstop = (e) => {
      const blob = new Blob(chunks, {type: 'audio/ogg; codecs=opus'});

      chunks = [];

      addAudioMessage('self', URL.createObjectURL(blob));

      var reader = new FileReader();
      reader.onloadend = () => {
        postMessage('audio', reader.result.replace(/^.*base64,/, ''));
      };
      reader.readAsDataURL(blob);
    };

    return mediaRecorder;
  }

  const messageInput = document.querySelector('#message-input');

  let isEmpty = !messageInput.value;

  function onMessageInputChange(e) {
    if (messageInput.value) {
      if (isEmpty) {
        messageButton.innerHTML = '&#8593;';
      }
    } else if (!isEmpty) {
      messageButton.innerHTML = '&#127908';
    }
    isEmpty = !messageInput.value;
  }

  messageInput.addEventListener('input', onMessageInputChange, false);

  function postMessage(type, data) {
    return fetch('/chat', {
      method: 'POST',
      body: JSON.stringify({type, data})
    });
  }

  function addTextMessage() {
      const text = messageInput.value;
      postMessage('text', text);
      requestAnimationFrame(() => {
        addMessage('self', {text})
        messageInput.value = '';
        onMessageInputChange();
      });
  }

  messageInput.addEventListener('keydown', (e) => {
    if (!isEmpty && e.keyCode === 13 && !e.shiftKey && !e.repeat) {
      addTextMessage();
    }
  }, false);

  let mediaRecorder;

  messageButton.addEventListener('click', (e) => {
    if (!isEmpty) {
      addTextMessage();
      return;
    }

    if (!mediaRecorder) {
      console.error('mediaRecorder is not available');
      return;
    }

    if (mediaRecorder.state === 'inactive') {
      messageButton.classList.add('animate-pulse', 'text-red-500');
      messageButton.innerHTML = '&#9632;';
      mediaRecorder.start();
    } else if (mediaRecorder.state === 'recording') {
      messageButton.classList.remove('animate-pulse', 'text-red-500');
      messageButton.innerHTML = '&#127908';
      mediaRecorder.stop();
    }
  });

  const eventSource = createEventSource();

  navigator.mediaDevices.getUserMedia({audio: true})
    .then((stream) => {
      mediaRecorder = createMediaRecorder(stream);
    })
    .catch((err) => {
      console.error(`error encountered from getUserMedia: ${err}`);
    });

} (window.marked));
