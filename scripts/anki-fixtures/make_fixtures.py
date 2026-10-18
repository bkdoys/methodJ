"""
Fabrique de vrais paquets Anki (.apkg) avec la bibliothèque officielle, pour tester l'import (src/utils/apkg/).
Les paquets ne contiennent que du contenu inventé ; les dates de révision sont relatives à aujourd'hui.

    python3 -m venv /tmp/ankivenv && /tmp/ankivenv/bin/pip install anki
    /tmp/ankivenv/bin/python scripts/anki-fixtures/make_fixtures.py

Sortie : src/utils/__tests__/fixtures/{sm2-legacy,sm2-latest,fsrs-latest}.apkg (versions 25.09 d'Anki : « latest » = base zstd,
« legacy » = case « Prendre en charge les anciennes versions d'Anki »).
"""
import os
import shutil
import struct
import sys
import tempfile
import zlib

from anki.collection import Collection, DeckIdLimit, ExportAnkiPackageOptions
from anki.scheduler.v3 import CardAnswer

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'utils', '__tests__', 'fixtures')


def png(width, height, rgb, path):
    """PNG uni minimal (pas de dépendance)."""
    raw = b''.join(b'\x00' + bytes(rgb) * width for _ in range(height))

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    data = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw))
        + chunk(b'IEND', b'')
    )
    with open(path, 'wb') as f:
        f.write(data)


def build(workdir, fsrs):
    col = Collection(os.path.join(workdir, 'collection.anki2'))
    media = os.path.join(workdir, 'src-media')
    os.makedirs(media)
    png(40, 30, (200, 60, 60), os.path.join(media, 'cell.png'))
    png(60, 40, (60, 160, 90), os.path.join(media, 'diagram.png'))
    png(20, 20, (60, 90, 200), os.path.join(media, 'extra.png'))

    bio = col.decks.id('Biologie::Cellule')
    anat = col.decks.id('Anatomie')

    def add(model_name, deck, fields, tags=None):
        model = col.models.by_name(model_name)
        note = col.new_note(model)
        for key, value in fields.items():
            note[key] = value
        col.add_note(note, deck)
        return note

    # Le média doit exister dans le dossier du profil pour être exporté
    for name in ('cell.png', 'diagram.png', 'extra.png'):
        shutil.copy(os.path.join(media, name), os.path.join(col.media.dir(), name))

    n_basic = add('Basic', bio, {'Front': "Quelle organelle produit l'ATP ?", 'Back': 'La <b>mitochondrie</b>'})
    n_img = add('Basic', bio, {'Front': 'Légender : <img src="cell.png">', 'Back': 'Noyau<br><img src="extra.png">'})
    n_rev = add('Basic (and reversed card)', bio, {'Front': 'ATP', 'Back': 'Adénosine triphosphate'})
    n_cloze = add(
        'Cloze', bio,
        {'Text': "La {{c1::mitochondrie}} produit l'{{c2::ATP::molécule}}", 'Back Extra': 'Voir le cours'},
    )
    n_susp = add('Basic', anat, {'Front': 'Carte suspendue', 'Back': 'Ne doit pas être importée'})
    add('Basic', anat, {'Front': 'Os du bras', 'Back': 'Humérus [sound:audio.mp3]'})

    # Image Occlusion : un rectangle, une ellipse, un polygone (trois groupes)
    col.add_image_occlusion_notetype()
    io_model = col.models.by_name('Image Occlusion')
    occlusions = (
        '{{c1::image-occlusion:rect:left=.1:top=.1:width=.3:height=.2:oi=1}}'
        '{{c2::image-occlusion:ellipse:left=.5:top=.5:rx=.1:ry=.15:oi=1}}'
        '{{c3::image-occlusion:polygon:points=0.1,0.6 0.3,0.6 0.2,0.8:oi=1}}'
    )
    col.add_image_occlusion_note(
        io_model['id'], os.path.join(media, 'diagram.png'), occlusions, 'Schéma de la cellule', 'Rappel', ['cours']
    )

    if fsrs:
        col.set_config('fsrs', True)

    def cards_of(note):
        return [col.get_card(cid) for cid in note.card_ids()]

    if not fsrs:
        # Avancement SM-2 écrit à la main (valeurs précises à retrouver à l'import)
        today = col.sched.today
        b = cards_of(n_basic)[0]
        b.type, b.queue, b.ivl, b.due, b.factor, b.reps, b.lapses = 2, 2, 21, today + 5, 2300, 6, 1
        col.update_card(b)
        i = cards_of(n_img)[0]
        i.type, i.queue, i.ivl, i.due, i.factor, i.reps, i.lapses = 2, 2, 3, today - 2, 1500, 4, 3
        col.update_card(i)
        r0, r1 = cards_of(n_rev)
        r0.type, r0.queue, r0.ivl, r0.due, r0.factor, r0.reps = 2, 2, 90, today + 40, 3000, 9
        col.update_card(r0)  # r1 reste nouvelle
        c0 = sorted(cards_of(n_cloze), key=lambda c: c.ord)[0]
        c0.type, c0.queue, c0.ivl, c0.due, c0.factor, c0.reps = 2, 2, 10, today + 1, 2500, 3
        col.update_card(c0)
        s = cards_of(n_susp)[0]
        s.queue = -1
        col.update_card(s)
    else:
        # Avancement FSRS : réponses réelles, l'état mémoire est stocké dans la carte
        for rating in (CardAnswer.GOOD, CardAnswer.GOOD, CardAnswer.EASY, CardAnswer.AGAIN, CardAnswer.GOOD):
            queued = col.sched.get_queued_cards(fetch_limit=1)
            if not queued.cards:
                break
            q = queued.cards[0]
            card = col.get_card(q.card.id)
            card.start_timer()
            col.sched.answer_card(col.sched.build_answer(card=card, states=q.states, rating=rating))
        s = cards_of(n_susp)[0]
        s.queue = -1
        col.update_card(s)

    return col, bio, anat


def export(col, legacy, path):
    # Tout le contenu : les deux paquets (Biologie::Cellule et Anatomie) sont sous un parent commun pour un seul fichier
    options = ExportAnkiPackageOptions(with_scheduling=True, with_deck_configs=True, with_media=True, legacy=legacy)
    from anki.collection import NoteIdsLimit
    note_ids = col.find_notes('')
    col.export_anki_package(out_path=path, options=options, limit=NoteIdsLimit(note_ids))


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fsrs, legacy in (('sm2-legacy', False, True), ('sm2-latest', False, False), ('fsrs-latest', True, False)):
        work = tempfile.mkdtemp()
        try:
            col, _, _ = build(work, fsrs)
            export(col, legacy, os.path.join(OUT, name + '.apkg'))
            col.close()
            print('écrit', name + '.apkg', os.path.getsize(os.path.join(OUT, name + '.apkg')), 'octets')
        finally:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(main())
