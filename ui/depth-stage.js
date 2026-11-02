class EchoDepthStage {
  constructor(stage, onChange = () => {}) {
    this.stage = stage;
    this.onChange = onChange;
    this.background = stage.querySelector('[data-layer="bg"]');
    this.foreground = stage.querySelector('[data-layer="fg"]');
    this.generation = 0;
    this.art = '';
    this.subject = '';
    this.artReady = false;
    this.subjectReady = false;
    this.failed = false;
    this.pending = new Set();
  }

  update(art, subject) {
    if (this.art === art && this.subject === subject) return;
    const sameArt = this.art === art;
    this.generation += 1;
    const generation = this.generation;
    this.cancelPending();
    this.art = art;
    this.subject = subject;
    this.failed = false;
    this.subjectReady = false;
    this.foreground.style.backgroundImage = 'none';
    if (!sameArt || !art) {
      this.artReady = false;
      this.background.style.backgroundImage = 'none';
    }
    this.publish();
    if (!art) return;
    if (!this.artReady) this.load(art, generation, () => {
      this.artReady = true;
      this.background.style.backgroundImage = `url(${JSON.stringify(art)})`;
    });
    if (subject) this.load(subject, generation, () => {
      this.subjectReady = true;
      this.foreground.style.backgroundImage = `url(${JSON.stringify(subject)})`;
    });
  }

  load(url, generation, ready) {
    const image = new Image();
    const pending = { image, timeout: null };
    const finish = success => {
      clearTimeout(pending.timeout);
      image.onload = null;
      image.onerror = null;
      this.pending.delete(pending);
      if (generation !== this.generation) return;
      if (success && image.naturalWidth > 0) ready();
      else this.failed = true;
      this.publish();
    };
    pending.timeout = setTimeout(() => finish(false), 30000);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    this.pending.add(pending);
    image.src = url;
  }

  publish() {
    const ready = this.artReady && this.subjectReady && !this.failed;
    this.stage.classList.toggle('has-art', this.artReady);
    this.stage.classList.toggle('has-depth', ready);
    this.stage.dataset.depthState = this.failed ? 'error' : ready ? 'ready' : !this.art ? 'idle' : !this.artReady ? 'art-loading' : this.subject ? 'subject-loading' : 'flat';
    this.onChange();
  }

  cancelPending() {
    for (const pending of this.pending) {
      clearTimeout(pending.timeout);
      pending.image.onload = null;
      pending.image.onerror = null;
    }
    this.pending.clear();
  }

  retry() {
    const art = this.art;
    const subject = this.subject;
    this.subject = null;
    this.update(art, subject);
  }
}

globalThis.EchoDepthStage = EchoDepthStage;
