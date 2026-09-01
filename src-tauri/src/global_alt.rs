use rdev::{EventType, Key};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VoiceKeyEvent {
    Pressed,
    Released,
    Cancelled,
}

#[derive(Default)]
pub struct GlobalAltState {
    alt_down: bool,
    cancelled: bool,
}

impl GlobalAltState {
    pub fn handle(&mut self, event: EventType) -> Option<VoiceKeyEvent> {
        match event {
            EventType::KeyPress(Key::Alt) if !self.alt_down => {
                self.alt_down = true;
                self.cancelled = false;
                Some(VoiceKeyEvent::Pressed)
            }
            EventType::KeyPress(Key::Alt) => None,
            EventType::KeyPress(_) | EventType::ButtonPress(_)
                if self.alt_down && !self.cancelled =>
            {
                self.cancelled = true;
                Some(VoiceKeyEvent::Cancelled)
            }
            EventType::KeyRelease(Key::Alt) if self.alt_down => {
                let result = (!self.cancelled).then_some(VoiceKeyEvent::Released);
                self.alt_down = false;
                self.cancelled = false;
                result
            }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rdev::Button;

    #[test]
    fn emits_push_to_talk_press_and_release() {
        let mut state = GlobalAltState::default();
        assert_eq!(
            state.handle(EventType::KeyPress(Key::Alt)),
            Some(VoiceKeyEvent::Pressed)
        );
        assert_eq!(state.handle(EventType::KeyPress(Key::Alt)), None);
        assert_eq!(
            state.handle(EventType::KeyRelease(Key::Alt)),
            Some(VoiceKeyEvent::Released)
        );
    }

    #[test]
    fn cancels_alt_combinations_without_swallowing_them() {
        let mut state = GlobalAltState::default();
        assert_eq!(
            state.handle(EventType::KeyPress(Key::Alt)),
            Some(VoiceKeyEvent::Pressed)
        );
        assert_eq!(
            state.handle(EventType::KeyPress(Key::Tab)),
            Some(VoiceKeyEvent::Cancelled)
        );
        assert_eq!(state.handle(EventType::KeyRelease(Key::Alt)), None);
    }

    #[test]
    fn cancels_alt_mouse_gestures_and_ignores_alt_gr() {
        let mut state = GlobalAltState::default();
        assert_eq!(state.handle(EventType::KeyPress(Key::AltGr)), None);
        assert_eq!(
            state.handle(EventType::KeyPress(Key::Alt)),
            Some(VoiceKeyEvent::Pressed)
        );
        assert_eq!(
            state.handle(EventType::ButtonPress(Button::Left)),
            Some(VoiceKeyEvent::Cancelled)
        );
        assert_eq!(state.handle(EventType::KeyRelease(Key::Alt)), None);
    }
}
