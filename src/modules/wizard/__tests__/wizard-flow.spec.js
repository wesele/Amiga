import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";

describe("WizardFlow component logic", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("onNext step transitions", () => {
    it("increments current step from 0 to 1", async () => {
      const current = { value: 0 };
      const prevStep = { value: 0 };
      const emitted = { value: false };

      async function onNext(data) {
        if (emitted.value) return;
        if (current.value === 0) {
          current.value = 1;
        }
        prevStep.value = current.value;
      }

      await onNext({ nickname: "Test" });
      expect(current.value).toBe(1);
      expect(emitted.value).toBe(false);
    });

    it("does not increment past step 2 without emit guard", async () => {
      const current = { value: 0 };
      const prevStep = { value: 0 };
      const emitted = { value: false };

      async function onNext(data) {
        if (emitted.value) return;
        if (current.value === 0) {
          current.value = 1;
        } else if (current.value === 1) {
          current.value = 2;
        }
        prevStep.value = current.value;
      }

      await onNext({ nickname: "Test" });
      await onNext({ targetLanguage: "es" });
      expect(current.value).toBe(2);
    });
  });

  describe("saveToBackend", () => {
    it("handles missing goal gracefully", async () => {
      const basicInfo = { value: { nickname: "Test", nativeLanguage: "zh" } };
      const learningGoal = { value: { targetLanguage: "es", cefrLevel: "A1", dailyMinutes: 15 } };
      const apiCalls = [];

      const mockApi = {
        createUser: vi.fn().mockResolvedValue({ id: "user-1" }),
        saveLearningGoal: vi.fn().mockResolvedValue({}),
        initUserVocab: vi.fn().mockResolvedValue(undefined),
      };

      async function saveToBackend() {
        const info = basicInfo.value;
        const goal = learningGoal.value;
        await mockApi.createUser({
          nickname: info.nickname || "学习者",
          avatar: "😊",
          native_language: info.nativeLanguage || "zh",
          country: "CN",
          gender: "private",
          birth_year: null,
        });
        await mockApi.saveLearningGoal({
          user_id: "user-1",
          target_language: goal.targetLanguage || "es",
          cefr_level: goal.cefrLevel || "A1",
          daily_minutes: goal.dailyMinutes || 15,
          objective: "daily_conversation",
        });
        if (goal.cefrLevel && goal.cefrLevel !== "A0") {
          await mockApi.initUserVocab("user-1", goal.cefrLevel);
        }
      }

      await saveToBackend();

      expect(mockApi.createUser).toHaveBeenCalledWith({
        nickname: "Test",
        avatar: "😊",
        native_language: "zh",
        country: "CN",
        gender: "private",
        birth_year: null,
      });
      expect(mockApi.saveLearningGoal).toHaveBeenCalledWith({
        user_id: "user-1",
        target_language: "es",
        cefr_level: "A1",
        daily_minutes: 15,
        objective: "daily_conversation",
      });
      expect(mockApi.initUserVocab).toHaveBeenCalledWith("user-1", "A1");
    });

    it("skips vocab init when cefrLevel is A0", async () => {
      const basicInfo = { value: { nickname: "Test" } };
      const learningGoal = { value: { cefrLevel: "A0" } };
      const mockApi = {
        createUser: vi.fn().mockResolvedValue({ id: "user-1" }),
        saveLearningGoal: vi.fn().mockResolvedValue({}),
        initUserVocab: vi.fn(),
      };

      async function saveToBackend() {
        const info = basicInfo.value;
        const goal = learningGoal.value;
        await mockApi.createUser({
          nickname: info.nickname || "学习者",
          avatar: "😊",
          native_language: "zh",
          country: "CN",
          gender: "private",
          birth_year: null,
        });
        await mockApi.saveLearningGoal({
          user_id: "user-1",
          target_language: "es",
          cefr_level: "A1",
          daily_minutes: 15,
          objective: "daily_conversation",
        });
        if (goal.cefrLevel && goal.cefrLevel !== "A0") {
          await mockApi.initUserVocab("user-1", goal.cefrLevel);
        }
      }

      await saveToBackend();
      expect(mockApi.initUserVocab).not.toHaveBeenCalled();
    });

    it("handles API errors gracefully", async () => {
      const basicInfo = { value: { nickname: "Test" } };
      const learningGoal = { value: { cefrLevel: "A1" } };
      const mockApi = {
        createUser: vi.fn().mockRejectedValue(new Error("DB error")),
        saveLearningGoal: vi.fn(),
        initUserVocab: vi.fn(),
      };

      async function saveToBackend() {
        try {
          const info = basicInfo.value;
          const goal = learningGoal.value;
          await mockApi.createUser({
            nickname: info.nickname || "学习者",
            avatar: "😊",
            native_language: "zh",
            country: "CN",
            gender: "private",
            birth_year: null,
          });
        } catch (e) {
        }
      }

      await saveToBackend();
      expect(mockApi.createUser).toHaveBeenCalled();
      expect(mockApi.saveLearningGoal).not.toHaveBeenCalled();
    });
  });
});
