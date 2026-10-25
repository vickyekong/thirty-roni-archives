import { LIMITS } from '@shared/contribution'
import { TextAreaField } from '@/components/ui/Field'
import { MediaUploader } from '../media/MediaUploader'
import { VoiceRecorder } from '../media/VoiceRecorder'
import type { StepProps } from './WritingSteps'

export function MediaStep({ payload, setSection, media }: StepProps) {
  return (
    <div className="flex flex-col gap-12">
      <MediaUploader
        context={media}
        purpose="photo"
        title="Photographs"
        hint="Up to ten. Photos are resized and their location data removed before they leave your device."
        addLabel="Add photographs"
      />
      <MediaUploader
        context={media}
        purpose="video"
        title="A short video"
        hint="One clip, up to 50 MB (roughly one to two minutes of phone video). Trim longer clips before adding them."
        addLabel="Add a video"
      />
      <MediaUploader
        context={media}
        purpose="voice"
        title="A voice note"
        hint="Record a message in your own voice, or upload a recording you already have."
        addLabel="Upload an audio file"
        extra={(addFiles, remaining) => (remaining > 0 ? <VoiceRecorder onRecorded={(file) => addFiles([file])} /> : null)}
      />
      <TextAreaField
        label="A letter to Roni"
        hint="Something longer, in your own words. It may be featured among the letters in her archive."
        optional
        rows={10}
        value={payload.letter.body}
        maxLength={LIMITS.letter}
        onValueChange={(body) => setSection('letter', { body })}
        className="[&_textarea]:font-serif [&_textarea]:text-lg"
      />
    </div>
  )
}
