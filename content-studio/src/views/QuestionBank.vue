<template>
  <div class="bank-manager">
    <div class="flex justify-between items-center mb-4">
      <div>
        <h2 class="page-title">📚 题库与课程设计</h2>
        <p class="page-desc">设计语言级别的单元框架并监控覆盖率</p>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMessage" class="toast-error">
      <span>⚠️ {{ errorMessage }}</span>
      <button @click="errorMessage = ''">✕</button>
    </div>

    <div class="bank-layout">
      <!-- 左侧：语言-级别 导航 -->
      <aside class="bank-sidebar">
        <div v-for="pair in languagePairs" :key="pair.id" class="lang-group">
          <div 
            class="lang-node" 
            :class="{ active: selectedPairId === pair.id }"
            @click="selectLang(pair)"
          >
            <span class="node-icon">🌐</span>
            <span class="node-label">{{ pair.from }} → {{ pair.to }}</span>
          </div>
          
          <div v-if="selectedPairId === pair.id" class="level-list">
            <div 
              v-for="level in pair.cefrLevels" 
              :key="level" 
              class="level-node" 
              :class="{ active: selectedLevel === level }"
              @click="selectLevel(pair, level)"
            >
              {{ level }}
            </div>
          </div>
        </div>
      </aside>

      <!-- 右侧：内容区 -->
      <main class="bank-main">
        <!-- 状态 1: 仅选中语言 -->
        <div v-if="selectedPairId && !selectedLevel" class="lang-overview">
          <div class="overview-header">
            <h3>{{ selectedPair?.from }} → {{ selectedPair?.to }} 课程设计概览</h3>
          </div>
          <div class="overview-grid">
            <div v-for="level in selectedPair?.cefrLevels" :key="level" class="overview-card">
              <div class="card-title">{{ level }} 级别</div>
              <div class="card-stats">
                <div class="stat-item">
                  <span class="stat-val">{{ getUnitCount(selectedPair?.to, level) }}</span>
                  <span class="stat-label">单元</span>
                </div>
                <div class="stat-item">
                  <span class="stat-val">{{ calculateCoverage(selectedPair, level).vocab }}%</span>
                  <span class="stat-label">词汇覆盖</span>
                </div>
              </div>
              <button class="btn btn-sm btn-primary" @click="selectLevel(selectedPair, level)">管理设计</button>
            </div>
          </div>
        </div>

        <!-- 状态 2: 选中级别 -->
        <div v-if="selectedPairId && selectedLevel" class="level-detail">
          <div class="detail-header">
            <div class="header-left">
              <h3>{{ selectedPair?.from }} → {{ selectedPair?.to }} · {{ selectedLevel }} 单元框架</h3>
            </div>
            <div class="header-actions">
              <button class="btn btn-primary" @click="generateAI()" :disabled="isAsyncBusy">✨ AI 生成框架</button>
              <button class="btn btn-secondary" @click="generateQuestions()" :disabled="isAsyncBusy">🤖 AI 生成题目</button>
              <button class="btn btn-secondary" @click="generateAllImages()" :disabled="isAsyncBusy">🎨 AI 生成插图</button>
            </div>
          </div>

          <!-- 覆盖率面板 -->
          <div class="coverage-panel">
            <div class="coverage-item" @click="showDetails('vocab')" title="词库词汇已分配到小节的比例">
              <div class="cov-info">
                <span class="cov-label">词汇覆盖率</span>
                <span class="cov-val">{{ coverage.vocab }}%</span>
              </div>
              <div class="cov-bar"><div class="cov-fill" :style="{ width: coverage.vocab + '%' }"></div></div>
            </div>
            <div class="coverage-item" @click="showDetails('topic')" title="已分配覆盖单词的小节占比">
              <div class="cov-info">
                <span class="cov-label">话题覆盖率</span>
                <span class="cov-val">{{ coverage.topic }}%</span>
              </div>
              <div class="cov-bar"><div class="cov-fill" :style="{ width: coverage.topic + '%' }"></div></div>
            </div>
            <div class="coverage-item" @click="showDetails('knowledge')" title="已分配语法点的小节占比">
              <div class="cov-info">
                <span class="cov-label">知识点覆盖率</span>
                <span class="cov-val">{{ coverage.knowledge }}%</span>
              </div>
              <div class="cov-bar"><div class="cov-fill" :style="{ width: coverage.knowledge + '%' }"></div></div>
            </div>
          </div>

          <!-- 单元编辑器 -->
          <div class="framework-editor">
            <div v-for="(unit, uIdx) in framework" :key="unit.id" class="unit-block">
              <div class="unit-header">
                <div class="unit-title-group">
                  <input v-model="unit.titleNative" class="unit-title-input" placeholder="母语标题" @change="saveCurrentFramework" />
                  <input v-model="unit.titleTarget" class="unit-title-input target" placeholder="目标语标题" @change="saveCurrentFramework" />
                </div>
                <div class="unit-meta-tags">
                  <span class="unit-badge">词汇: {{ unit.vocabCount || 0 }}</span>
                  <span class="unit-badge">小节: {{ unit.sections?.length || 0 }}</span>
                </div>
                <button class="btn btn-sm btn-secondary" @click.stop="generateQuestionsForUnit(uIdx)">🤖 生成题目</button>
                <button class="btn btn-sm btn-danger" @click="removeUnit(uIdx)">🗑️</button>
              </div>
              <div class="unit-goals">
                <input v-model="unit.goalNative" class="unit-goal-input" placeholder="母语学习目标..." @change="saveCurrentFramework" />
                <input v-model="unit.goalTarget" class="unit-goal-input target" placeholder="目标语学习目标..." @change="saveCurrentFramework" />
              </div>
              <div class="unit-grammar-scenarios" v-if="unit.grammarPoints?.length || unit.scenarios?.length">
                <div v-if="unit.grammarPoints?.length" class="meta-tags">
                  <span class="tag tag-purple-sm">📐 {{ unit.grammarPoints.join(', ') }}</span>
                </div>
                <div v-if="unit.scenarios?.length" class="meta-tags">
                  <span class="tag tag-green-sm">🎬 {{ unit.scenarios.join(', ') }}</span>
                </div>
              </div>
              <div class="sections-list">
                <div v-for="(sec, sIdx) in unit.sections" :key="sec.id" class="section-item">
                  <div class="section-header" @click="toggleSectionDetail(uIdx, sIdx)">
                    <div class="section-main">
                      <span class="section-id">{{ sec.id }}</span>
                      <span class="section-title">{{ sec.titleNative || sec.titleTarget }}</span>
                      <span class="section-title-target">{{ sec.titleTarget && sec.titleTarget !== sec.titleNative ? `(${sec.titleTarget})` : '' }}</span>
                    </div>
                    <div class="section-actions">
                      <span class="word-count">{{ sec.coveredWords?.length || 0 }} 词</span>
                      <span class="expand-icon">{{ expandedSections.has(`${uIdx}-${sIdx}`) ? '▲' : '▼' }}</span>
                       <button v-if="hasSectionQuestions(unit, sec)" class="btn btn-sm btn-ghost" @click.stop="previewUnit(uIdx, sIdx)" title="预览题目">👁️</button>
                      <button class="btn btn-sm btn-ghost" @click.stop="generateQuestionsForSectionOnly(uIdx, sIdx)" title="生成题目">🤖</button>
                      <button class="btn btn-sm btn-ghost" @click.stop="removeSection(uIdx, sIdx)">✕</button>
                    </div>
                  </div>
                  <div v-if="expandedSections.has(`${uIdx}-${sIdx}`)" class="section-detail">
                    <div class="detail-row">
                      <label>母语标题</label>
                      <input v-model="sec.titleNative" @change="saveCurrentFramework" />
                    </div>
                    <div class="detail-row">
                      <label>目标语标题</label>
                      <input v-model="sec.titleTarget" @change="saveCurrentFramework" />
                    </div>
                    <div class="detail-row">
                      <label>覆盖单词</label>
                      <input v-model="sec.coveredWords" placeholder="逗号分隔" @change="normalizeWords(sec)" />
                      <div class="word-chips" v-if="Array.isArray(sec.coveredWords) && sec.coveredWords.length">
                        <span v-for="(w, wi) in sec.coveredWords" :key="wi" class="word-chip">{{ w }}</span>
                      </div>
                    </div>
                    <div class="detail-row">
                      <label>语法点</label>
                      <input v-model="sec.grammarPoint" @change="saveCurrentFramework" />
                    </div>
                    <div class="detail-row">
                      <label>场景</label>
                      <input v-model="sec.scenario" @change="saveCurrentFramework" />
                    </div>
                  </div>
                </div>
                <button class="btn btn-sm btn-secondary" @click="addSection(uIdx)">➕ 添加小节</button>
              </div>
            </div>
            <button class="btn btn-secondary w-full mt-4" @click="addUnit">➕ 添加新单元</button>
          </div>
        </div>

        <!-- 状态 3: 未选择 -->
        <div v-if="!selectedPairId" class="empty-state">
          <div class="empty-content">
            <span class="empty-icon">🗺️</span>
            <p>请从左侧选择一种语言组合开始设计课程</p>
          </div>
        </div>
      </main>
    </div>

    <!-- 覆盖率详情模态框 -->
    <div v-if="coverageDetail.show" class="modal-overlay" @click.self="coverageDetail.show = false">
      <div class="modal">
        <h3 class="modal-title">{{ coverageDetail.title }}</h3>
        <div class="modal-body">
          <div v-if="coverageDetail.list.length === 0" class="empty-text">全部覆盖！</div>
          <div v-else class="detail-list">
            <div v-for="item in coverageDetail.list" :key="item" class="detail-item">{{ item }}</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="coverageDetail.show = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 题目预览 -->
    <div v-if="preview.show" class="modal-overlay" @click.self="closePreview">
      <div class="preview-container">
        <!-- 左侧：题目列表 -->
        <aside class="preview-sidebar">
          <div class="preview-sidebar-header">
            <div class="header-info">
              <h3>{{ preview.unitName }}</h3>
              <p>{{ preview.questions.length }} 道题目</p>
            </div>
            <button class="btn-close-sidebar" @click="closePreview">✕</button>
          </div>
          <div class="preview-sidebar-content">
            <div v-for="(group, gIdx) in preview.groupedQuestions" :key="gIdx" class="preview-group">
              <div class="preview-group-title">{{ group.name }}</div>
              <div class="preview-q-list">
                <div 
                  v-for="(q, qIdx) in group.questions" 
                  :key="q.id" 
                  class="preview-q-item" 
                  :class="{ active: getFlatIndex(group, qIdx) === preview.currentIndex }"
                  @click="selectQuestion(group, qIdx)"
                >
                  <span class="q-idx">{{ qIdx + 1 }}</span>
                  <span class="q-type-tag">{{ q.type }}</span>
                  <span class="q-preview-text">{{ q.typeName || q.type }}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <!-- 中间：题目编辑器 -->
        <div class="preview-editor">
          <template v-if="currentQuestion">
            <div class="editor-header">
              <div class="editor-title">
                <span class="editor-type-badge">{{ currentQuestion.typeName || currentQuestion.type }}</span>
                <span class="editor-id">{{ currentQuestion.id }}</span>
              </div>
              <div class="editor-actions">
                <button
                  v-if="currentQuestion.type === 'T01' || currentQuestion.type === 'T02'"
                  class="btn btn-sm btn-secondary"
                  :disabled="isAsyncBusy"
                  @click="generateImagesForCurrent"
                >🎨 生成图片</button>
                <button class="btn btn-sm btn-primary" @click="saveCurrentQuestion" :disabled="!isDirty">💾 保存</button>
                <button class="btn btn-sm btn-danger" @click="deleteCurrentQuestion">🗑️</button>
              </div>
            </div>
            <div class="editor-body">
              <!-- 基本信息 -->
              <div class="editor-section">
                <div class="editor-section-title">📋 基本信息</div>
                <div class="editor-field"><label>题型</label><input v-model="currentQuestion.typeName" @input="markDirty" /></div>
                <div class="editor-field"><label>难度 (1-5)</label><input type="number" min="1" max="5" v-model.number="currentQuestion.difficulty" @input="markDirty" /></div>
                <div class="editor-field"><label>状态</label>
                  <select v-model="currentQuestion.status" @change="markDirty">
                    <option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">已拒绝</option>
                  </select>
                </div>
                <div class="editor-field"><label>标签 (逗号分隔)</label><input v-model="editor.tagsStr" @input="onTagsChange" /></div>
              </div>

              <!-- 题目内容 -->
              <div class="editor-section">
                <div class="editor-section-title">✏️ 题目内容</div>

                <!-- T01 -->
                <template v-if="currentQuestion.type === 'T01'">
                  <div class="editor-field"><label>图片描述</label><input v-model="currentQuestion.imageDesc" @input="markDirty" /></div>
                  <div class="editor-field"><label>绘图提示词</label><input v-model="currentQuestion.imagePrompt" @input="markDirty" placeholder="英文视觉描述（可选）" /></div>
                  <div class="editor-field">
                    <label>题目图片</label>
                    <QuestionImage
                      :image-url="currentQuestion.imageUrl"
                      :image-svg="currentQuestion.imageSvg"
                      :fallback="currentQuestion.imageDesc"
                    />
                  </div>
                  <div class="editor-field"><label>选项 (每行一个)</label><textarea v-model="editor.optionsStr" @input="onOptionsChange" rows="4"></textarea></div>
                  <div class="editor-field"><label>正确答案索引</label><input type="number" min="0" v-model.number="currentQuestion.answerIdx" @input="markDirty" /></div>
                </template>

                <!-- T02 -->
                <template v-else-if="currentQuestion.type === 'T02'">
                  <div class="editor-field"><label>听力文本</label><input v-model="currentQuestion.audioText" @input="markDirty" /></div>
                  <div class="editor-field" v-for="(opt, i) in currentQuestion.imageOptions" :key="i">
                    <label>图片选项 {{ i + 1 }}</label>
                    <div class="inline-edit"><input v-model="opt.desc" @input="markDirty" placeholder="图片描述" /><input v-model="opt.prompt" @input="markDirty" placeholder="绘图提示词" style="font-size:11px;color:#666" /></div>
                    <QuestionImage
                      class="mt-2"
                      size="small"
                      :image-url="opt.imageUrl"
                      :image-svg="opt.imageSvg"
                      :fallback="opt.desc"
                    />
                  </div>
                  <div class="editor-field"><label>正确答案索引</label><input type="number" min="0" v-model.number="currentQuestion.answerIdx" @input="markDirty" /></div>
                </template>

                <!-- T03 -->
                <template v-else-if="currentQuestion.type === 'T03'">
                  <div class="editor-field" v-for="(p, i) in currentQuestion.pairs" :key="i">
                    <label>配对 {{ i + 1 }}</label>
                    <div class="inline-edit"><input v-model="p.left" @input="markDirty" placeholder="左侧" /><input v-model="p.right" @input="markDirty" placeholder="右侧" /></div>
                  </div>
                </template>

                <!-- T05 -->
                <template v-else-if="currentQuestion.type === 'T05'">
                  <div class="editor-field"><label>完整句子</label><textarea v-model="currentQuestion.sentence" @input="markDirty" rows="3"></textarea></div>
                  <div class="editor-field"><label>填空词 (blank)</label><input v-model="currentQuestion.blank" @input="markDirty" /></div>
                  <div class="editor-field"><label>选项 (每行一个)</label><textarea v-model="editor.optionsStr" @input="onOptionsChange" rows="4"></textarea></div>
                  <div class="editor-field"><label>正确答案索引</label><input type="number" min="0" v-model.number="currentQuestion.answerIdx" @input="markDirty" /></div>
                </template>

                <!-- T06 -->
                <template v-else-if="currentQuestion.type === 'T06'">
                  <div class="editor-field"><label>目标句</label><input v-model="currentQuestion.targetSentence" @input="markDirty" /></div>
                  <div class="editor-field"><label>词块 (每行一个)</label><textarea v-model="editor.wordsStr" @input="onWordsChange" rows="4"></textarea></div>
                </template>

                <!-- T07 -->
                <template v-else-if="currentQuestion.type === 'T07'">
                  <div class="editor-field"><label>源文本</label><textarea v-model="currentQuestion.sourceText" @input="markDirty" rows="2"></textarea></div>
                  <div class="editor-field"><label>选项 (每行一个)</label><textarea v-model="editor.optionsStr" @input="onOptionsChange" rows="4"></textarea></div>
                  <div class="editor-field"><label>正确答案索引</label><input type="number" min="0" v-model.number="currentQuestion.answerIdx" @input="markDirty" /></div>
                </template>

                <!-- T08 -->
                <template v-else-if="currentQuestion.type === 'T08'">
                  <div class="editor-field"><label>听力文本</label><input v-model="currentQuestion.audioText" @input="markDirty" /></div>
                  <div class="editor-field"><label>题目</label><input v-model="currentQuestion.question" @input="markDirty" /></div>
                  <div class="editor-field"><label>选项 (每行一个)</label><textarea v-model="editor.optionsStr" @input="onOptionsChange" rows="4"></textarea></div>
                  <div class="editor-field"><label>正确答案索引</label><input type="number" min="0" v-model.number="currentQuestion.answerIdx" @input="markDirty" /></div>
                </template>

                <!-- T09 -->
                <template v-else-if="currentQuestion.type === 'T09'">
                  <div class="editor-field"><label>听力文本</label><input v-model="currentQuestion.audioText" @input="markDirty" /></div>
                  <div class="editor-field"><label>提示 (hint)</label><input v-model="currentQuestion.hint" @input="markDirty" /></div>
                  <div class="editor-field"><label>正确答案</label><input v-model="currentQuestion.answer" @input="markDirty" /></div>
                  <div class="editor-field"><label>常见错误 (每行一个)</label><textarea v-model="editor.mistakesStr" @input="onMistakesChange" rows="3"></textarea></div>
                </template>

                <!-- T10 -->
                <template v-else-if="currentQuestion.type === 'T10'">
                  <div class="editor-field"><label>源文本</label><textarea v-model="currentQuestion.sourceText" @input="markDirty" rows="2"></textarea></div>
                  <div class="editor-field"><label>源语言</label><input v-model="currentQuestion.sourceLang" @input="markDirty" /></div>
                  <div class="editor-field"><label>提示 (hint)</label><input v-model="currentQuestion.hint" @input="markDirty" /></div>
                  <div class="editor-field"><label>可接受答案 (每行一个)</label><textarea v-model="editor.acceptedStr" @input="onAcceptedChange" rows="3"></textarea></div>
                </template>

                <!-- T11 -->
                <template v-else-if="currentQuestion.type === 'T11'">
                  <div class="editor-field"><label>朗读文本</label><textarea v-model="currentQuestion.audioText" @input="markDirty" rows="2"></textarea></div>
                  <div class="editor-field"><label>评分维度 (每行一个)</label><textarea v-model="editor.dimensionsStr" @input="onDimensionsChange" rows="3"></textarea></div>
                  <div class="editor-field"><label>难度说明</label><input v-model="currentQuestion.difficultyNotes" @input="markDirty" /></div>
                </template>

                <!-- T12 -->
                <template v-else-if="currentQuestion.type === 'T12'">
                  <div class="editor-field"><label>情景描述</label><textarea v-model="currentQuestion.scenario" @input="markDirty" rows="2"></textarea></div>
                  <div class="editor-field"><label>选项 (每行一个)</label><textarea v-model="editor.optionsStr" @input="onOptionsChange" rows="4"></textarea></div>
                  <div class="editor-field"><label>正确答案索引</label><input type="number" min="0" v-model.number="currentQuestion.answerIdx" @input="markDirty" /></div>
                  <div class="editor-field"><label>语用说明</label><input v-model="currentQuestion.pragmaticsNote" @input="markDirty" /></div>
                </template>

                <!-- Generic fallback -->
                <template v-else>
                  <div class="editor-field" v-for="(val, key) in displayFields(currentQuestion)" :key="key">
                    <label>{{ fieldLabel(key) }}</label>
                    <textarea v-if="typeof val === 'string' && val.length > 40" v-model="currentQuestion[key]" @input="markDirty" rows="3"></textarea>
                    <input v-else v-model="currentQuestion[key]" @input="markDirty" />
                  </div>
                </template>
              </div>
            </div>
            <div v-if="isDirty" class="editor-dirty-bar">
              <span>● 有未保存的修改</span>
              <button class="btn btn-sm btn-primary" @click="saveCurrentQuestion">立即保存</button>
            </div>
          </template>
          <div v-else class="editor-empty">
            <div class="editor-empty-icon">📝</div>
            <p>选择一个题目开始编辑</p>
            <p class="editor-empty-hint">修改会实时反映到右侧预览</p>
          </div>
        </div>

        <!-- 右侧：手机预览 -->
        <div class="preview-main">
          <div class="phone-frame">
            <div class="phone-notch"></div>
            <div class="phone-header">
              <span class="phone-title">{{ preview.sectionName }}</span>
              <span class="phone-subtitle">{{ preview.unitName }} · {{ preview.questions.length }} 题</span>
            </div>
            <div class="phone-body">
              <div v-if="preview.questions.length === 0" class="phone-empty">
                <p>暂无题目</p>
                <p class="phone-empty-hint">请先用"AI生成题目"为此小节创建题目</p>
              </div>
              <div v-else class="phone-question">
                <div class="q-count">{{ preview.currentIndex + 1 }} / {{ preview.questions.length }}</div>
                <div class="q-card">
                  <div class="q-type-badge">{{ currentQuestion?.typeName || currentQuestion?.type }}</div>
                  <div class="q-content">
                    <!-- T01: 图片识词 -->
                    <div v-if="currentQuestion?.type === 'T01'" class="q-render-t01">
                      <QuestionImage
                        :image-url="currentQuestion.imageUrl"
                        :image-svg="currentQuestion.imageSvg"
                        :fallback="currentQuestion.imageDesc"
                      />
                      <div class="q-options">
                        <div v-for="(opt, i) in currentQuestion.options" :key="i" 
                             class="q-opt-btn" :class="{ 'is-correct': preview.showAnswer && i === currentQuestion.answerIdx }">
                          {{ opt }}
                        </div>
                      </div>
                    </div>

                    <!-- T03: 双向配对 -->
                    <div v-else-if="currentQuestion?.type === 'T03'" class="q-render-t03">
                      <div class="q-pairs-grid">
                        <div class="q-pair-col">
                          <div v-for="(p, i) in currentQuestion.pairs" :key="i" class="q-pair-item">{{ p.left }}</div>
                        </div>
                        <div class="q-pair-col">
                          <div v-for="(p, i) in currentQuestion.pairs" :key="i" class="q-pair-item">{{ p.right }}</div>
                        </div>
                      </div>
                    </div>

                    <!-- T05: 补全句子 -->
                    <div v-else-if="currentQuestion?.type === 'T05'" class="q-render-t05">
                      <div class="q-sentence">
                        {{ currentQuestion.sentence.replace(currentQuestion.blank, '_____') }}
                      </div>
                      <div class="q-options">
                        <div v-for="(opt, i) in currentQuestion.options" :key="i" 
                             class="q-opt-btn" :class="{ 'is-correct': preview.showAnswer && i === currentQuestion.answerIdx }">
                          {{ opt }}
                        </div>
                      </div>
                    </div>

                    <!-- T06: 句子排序 -->
                    <div v-else-if="currentQuestion?.type === 'T06'" class="q-render-t06">
                      <div class="q-word-pool">
                        <div v-for="(w, i) in currentQuestion.words" :key="i" class="q-word-chip">{{ w }}</div>
                      </div>
                      <div v-if="preview.showAnswer" class="q-answer-text">
                        目标句: {{ currentQuestion.targetSentence }}
                      </div>
                    </div>

                    <!-- T07: 翻译选择 -->
                    <div v-else-if="currentQuestion?.type === 'T07'" class="q-render-t07">
                      <div class="q-source-text">{{ currentQuestion.sourceText }}</div>
                      <div class="q-options">
                        <div v-for="(opt, i) in currentQuestion.options" :key="i" 
                             class="q-opt-btn" :class="{ 'is-correct': preview.showAnswer && i === currentQuestion.answerIdx }">
                          {{ opt }}
                        </div>
                      </div>
                    </div>

                    <!-- T02: 听音选图 -->
                    <div v-else-if="currentQuestion?.type === 'T02'" class="q-render-t02">
                      <div class="q-audio-hint">🔊 听发音，选择正确的图片</div>
                      <div class="q-image-options">
                        <div v-for="(opt, i) in currentQuestion.imageOptions" :key="i"
                             class="q-image-opt" :class="{ 'is-correct': preview.showAnswer && i === currentQuestion.answerIdx }">
                          <QuestionImage
                            size="small"
                            :image-url="opt.imageUrl"
                            :image-svg="opt.imageSvg"
                            :fallback="opt.desc"
                          />
                        </div>
                      </div>
                    </div>

                    <!-- T08: 听力选择 -->
                    <div v-else-if="currentQuestion?.type === 'T08'" class="q-render-t08">
                      <div class="q-audio-hint">🔊 听力文本: {{ currentQuestion.audioText }}</div>
                      <div class="q-question-text">{{ currentQuestion.question }}</div>
                      <div class="q-options">
                        <div v-for="(opt, i) in currentQuestion.options" :key="i"
                             class="q-opt-btn" :class="{ 'is-correct': preview.showAnswer && i === currentQuestion.answerIdx }">
                          {{ opt }}
                        </div>
                      </div>
                    </div>

                    <!-- T09: 拼写输入 -->
                    <div v-else-if="currentQuestion?.type === 'T09'" class="q-render-t09">
                      <div class="q-audio-hint">🔊 {{ currentQuestion.audioText }}</div>
                      <div class="q-hint-text">💡 {{ currentQuestion.hint }}</div>
                      <div v-if="preview.showAnswer" class="q-answer-text">✍️ {{ currentQuestion.answer }}</div>
                      <div v-if="currentQuestion.commonMistakes?.length" class="q-mistakes">
                        <span class="mistakes-label">常见错误:</span>
                        <span v-for="(m, i) in currentQuestion.commonMistakes" :key="i" class="mistake-chip">{{ m }}</span>
                      </div>
                    </div>

                    <!-- T10: 翻译输入 -->
                    <div v-else-if="currentQuestion?.type === 'T10'" class="q-render-t10">
                      <div class="q-source-text">{{ currentQuestion.sourceText }}</div>
                      <div class="q-source-lang">({{ currentQuestion.sourceLang === 'zh' ? '中文' : currentQuestion.sourceLang }})</div>
                      <div v-if="currentQuestion.hint" class="q-hint-text">💡 {{ currentQuestion.hint }}</div>
                      <div v-if="preview.showAnswer" class="q-accepted-answers">
                        <span class="accepted-label">可接受答案:</span>
                        <span v-for="(a, i) in currentQuestion.acceptedAnswers" :key="i" class="accepted-chip">{{ a }}</span>
                      </div>
                    </div>

                    <!-- T11: 语音跟读 -->
                    <div v-else-if="currentQuestion?.type === 'T11'" class="q-render-t11">
                      <div class="q-read-aloud">🎙️ 请跟读以下句子</div>
                      <div class="q-read-text">{{ currentQuestion.audioText }}</div>
                      <div v-if="currentQuestion.scoringDimensions?.length" class="q-scoring">
                        <span class="scoring-label">评分维度:</span>
                        <span v-for="(d, i) in currentQuestion.scoringDimensions" :key="i" class="scoring-chip">{{ d }}</span>
                      </div>
                      <div v-if="currentQuestion.difficultyNotes" class="q-hint-text">📝 {{ currentQuestion.difficultyNotes }}</div>
                    </div>

                    <!-- T12: 情景回应 -->
                    <div v-else-if="currentQuestion?.type === 'T12'" class="q-render-t12">
                      <div class="q-scenario">📖 {{ currentQuestion.scenario }}</div>
                      <div class="q-options">
                        <div v-for="(opt, i) in currentQuestion.options" :key="i"
                             class="q-opt-btn" :class="{ 'is-correct': preview.showAnswer && i === currentQuestion.answerIdx }">
                          {{ opt }}
                        </div>
                      </div>
                      <div v-if="preview.showAnswer && currentQuestion.pragmaticsNote" class="q-pragmatics">
                        💬 {{ currentQuestion.pragmaticsNote }}
                      </div>
                    </div>

                    <!-- Generic Fallback -->
                    <div v-else class="q-render-generic">
                      <div class="q-field" v-for="(val, key) in displayFields(currentQuestion)" :key="key">
                        <span class="q-label">{{ fieldLabel(key) }}</span>
                        <span class="q-value">{{ formatFieldValue(val) }}</span>
                      </div>
                    </div>
                  </div>
                  <div v-if="preview.showAnswer" class="q-answer-box">
                    <div class="q-answer-label">正确答案:</div>
                    <div class="q-answer-value">{{ getAnswerText(currentQuestion) }}</div>
                  </div>
                </div>
                <div class="q-footer-controls">
                  <button v-if="currentQuestion?.audioText" class="btn-tts" @click="speak(currentQuestion.audioText)">🔊 播放</button>
                  <button class="btn-answer" @click="preview.showAnswer = !preview.showAnswer">
                    {{ preview.showAnswer ? '隐藏答案' : '显示答案' }}
                  </button>
                </div>
              </div>
            </div>
            <div class="phone-footer">
              <button class="phone-nav-btn" :disabled="preview.currentIndex <= 0" @click="prevQuestion">‹</button>
              <button class="phone-nav-btn" :disabled="preview.currentIndex >= preview.questions.length - 1" @click="nextQuestion">›</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useStorage } from '../composables/useStorage.js'
import { useSystemConfig } from '../composables/useSystemConfig.js'
import { useVocabStorage } from '../composables/useVocabStorage.js'
import { useUnitFramework } from '../composables/useUnitFramework.js'
import { useAsyncOperation } from '../composables/useAsyncOperation.js'
import { useLLM } from '../composables/useLLM.js'
import { useQuestionTypeStorage } from '../composables/useQuestionTypeStorage.js'
import { useImageGen } from '../composables/useImageGen.js'
import { useValidator } from '../composables/useValidator.js'
import { CEFR_TYPE_MAP, QUESTION_SCHEMAS } from '../data/question-types.js'
import QuestionImage from '../components/QuestionImage.vue'
import { buildSectionId, questionMatchesSection } from '../utils/sectionId.js'
import { normalizeQuestion, shuffleOptions } from '../utils/normalizeQuestion.js'

const route = useRoute()
const storage = useStorage()
const sysConfig = useSystemConfig()
const vocabStorage = useVocabStorage()
const unitFramework = useUnitFramework()
const asyncOp = useAsyncOperation()
const isAsyncBusy = computed(() => asyncOp.isLoading.value)
const llm = useLLM()
const typeStorage = useQuestionTypeStorage()
const imageGen = useImageGen()
const { validateQuestion } = useValidator()

const selectedPairId = ref('')
const selectedLevel = ref('')
const framework = ref([])
const coverage = ref({ vocab: 0, topic: 0, knowledge: 0 })
const errorMessage = ref('')
const expandedSections = ref(new Set())

const coverageDetail = ref({
  show: false,
  title: '',
  list: []
})

const preview = ref({
  show: false,
  unitIdx: -1,
  questions: [],
  groupedQuestions: [],
  currentIndex: 0,
  unitName: '',
  sectionName: '',
  showAnswer: false
})

const languagePairs = computed(() => {
  const pairs = sysConfig.config.value.languagePairs
  if (!Array.isArray(pairs)) return []
  return pairs
})

const selectedPair = computed(() => {
  if (!selectedPairId.value) return null
  return languagePairs.value.find(p => p.id === selectedPairId.value) || null
})

const currentQuestion = computed(() => {
  return preview.value.questions[preview.value.currentIndex] || null
})

// ---- 编辑器状态 ----
const isDirty = ref(false)
const editor = ref({
  tagsStr: '',
  optionsStr: '',
  wordsStr: '',
  mistakesStr: '',
  acceptedStr: '',
  dimensionsStr: ''
})

function syncEditorFromQuestion(q) {
  if (!q) return
  if (q.type === 'T02' && Array.isArray(q.imageOptions)) {
    q.imageOptions.forEach(opt => {
      if (!opt.prompt && opt.imagePrompt) opt.prompt = opt.imagePrompt
    })
  }
  editor.value.tagsStr = (q.tags || []).join(', ')
  editor.value.optionsStr = (q.options || []).join('\n')
  editor.value.wordsStr = (q.words || []).join('\n')
  editor.value.mistakesStr = (q.commonMistakes || []).join('\n')
  editor.value.acceptedStr = (q.acceptedAnswers || []).join('\n')
  editor.value.dimensionsStr = (q.scoringDimensions || []).join('\n')
}

function markDirty() { isDirty.value = true }
function resetEditor() { isDirty.value = false }

function onTagsChange() { if (!currentQuestion.value) return; currentQuestion.value.tags = editor.value.tagsStr.split(',').map(s => s.trim()).filter(Boolean); markDirty() }
function onOptionsChange() { if (!currentQuestion.value) return; currentQuestion.value.options = editor.value.optionsStr.split('\n').map(s => s.trim()).filter(Boolean); markDirty() }
function onWordsChange() { if (!currentQuestion.value) return; currentQuestion.value.words = editor.value.wordsStr.split('\n').map(s => s.trim()).filter(Boolean); markDirty() }
function onMistakesChange() { if (!currentQuestion.value) return; currentQuestion.value.commonMistakes = editor.value.mistakesStr.split('\n').map(s => s.trim()).filter(Boolean); markDirty() }
function onAcceptedChange() { if (!currentQuestion.value) return; currentQuestion.value.acceptedAnswers = editor.value.acceptedStr.split('\n').map(s => s.trim()).filter(Boolean); markDirty() }
function onDimensionsChange() { if (!currentQuestion.value) return; currentQuestion.value.scoringDimensions = editor.value.dimensionsStr.split('\n').map(s => s.trim()).filter(Boolean); markDirty() }

function saveCurrentQuestion() {
  const q = currentQuestion.value
  if (!q) return
  const normalized = normalizeQuestion(q, {
    pairId: q.pairId || selectedPairId.value,
    sectionId: q.sectionId,
    unit: q.unit,
    level: q.cefr || selectedLevel.value,
    sourceLang: selectedPair.value?.from,
    targetLang: selectedPair.value?.to,
    pairFrom: selectedPair.value?.from
  })
  Object.assign(q, normalized)
  storage.persistQuestions()
  isDirty.value = false
}

function imageFilename(questionId, slot = '') {
  const base = questionId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return slot ? `${base}-${slot}.jpg` : `${base}.jpg`
}

function getImagePrompt(opt) {
  return opt?.prompt || opt?.imagePrompt || ''
}

function getImageGenContext(q, optIndex = null) {
  if (q.type === 'T01') {
    const correct = q.options?.[q.answerIdx] || ''
    const distractors = (q.options || [])
      .filter((_, i) => i !== q.answerIdx)
      .map(o => String(o))
      .join('; ')
    return {
      correctConcept: correct || q.imageDesc || '',
      distractors: distractors || 'none'
    }
  }
  if (q.type === 'T02' && Array.isArray(q.imageOptions)) {
    const opt = optIndex != null ? q.imageOptions[optIndex] : null
    const distractors = q.imageOptions
      .filter((_, i) => i !== optIndex)
      .map(o => o.desc)
      .filter(Boolean)
      .join('; ')
    return {
      correctConcept: opt?.desc || q.imageOptions[q.answerIdx]?.desc || q.audioText || '',
      distractors: distractors || 'none'
    }
  }
  return { correctConcept: q.imageDesc || '', distractors: 'none' }
}

function imageGenProgress(msg, type = 'info') {
  asyncOp.setMessage(msg)
  asyncOp.addLog(msg, type)
}

function clearQuestionImages(q) {
  if (!q) return
  if (q.type === 'T01') {
    q.imageUrl = ''
    q.imageSvg = ''
  } else if (q.type === 'T02' && Array.isArray(q.imageOptions)) {
    q.imageOptions.forEach(opt => {
      opt.imageUrl = ''
      opt.imageSvg = ''
    })
  }
}

async function applyGeneratedImage(target, svg, url) {
  target.imageSvg = svg
  target.imageUrl = ''
  await nextTick()
  target.imageUrl = url
}

function hasExistingImage(target) {
  return !!(target?.imageUrl || target?.imageSvg)
}

function getLevelImageQuestions() {
  const pairId = selectedPairId.value
  const level = selectedLevel.value
  if (!pairId || !level) return []
  return storage.getQuestions({ pairId, cefr: level })
    .filter(q => q.type === 'T01' || q.type === 'T02')
}

function countPendingImages(questions) {
  let pending = 0
  let skipped = 0
  for (const q of questions) {
    if (q.type === 'T01') {
      if (hasExistingImage(q)) skipped++
      else pending++
    } else if (q.type === 'T02' && Array.isArray(q.imageOptions)) {
      for (const opt of q.imageOptions) {
        if (hasExistingImage(opt)) skipped++
        else pending++
      }
    }
  }
  return { pending, skipped }
}

async function generateAllImages() {
  const targetLang = selectedPair.value?.to
  const sourceLang = selectedPair.value?.from
  const level = selectedLevel.value
  if (!targetLang || !sourceLang || !level) {
    alert('请先选择语言和级别')
    return
  }

  const questions = getLevelImageQuestions()
  if (!questions.length) {
    alert('当前级别没有 T01/T02 题目，请先生成题目')
    return
  }

  const { pending, skipped } = countPendingImages(questions)
  if (pending === 0) {
    alert(`所有插图已存在，共跳过 ${skipped} 张`)
    return
  }

  const controller = asyncOp.start(`正在批量生成插图 (0/${pending})...`)
  asyncOp.addLog(`开始为 ${sourceLang} → ${targetLang} · ${level} 生成插图`, 'info')
  asyncOp.addLog(`待生成 ${pending} 张，跳过已有 ${skipped} 张`, 'info')

  let done = 0
  let errors = 0

  try {
    for (const q of questions) {
      if (controller.signal.aborted) break

      if (q.type === 'T01') {
        if (hasExistingImage(q)) {
          asyncOp.addLog(`跳过 T01 [${q.id}]（已有插图）`, 'info')
          continue
        }
        asyncOp.setMessage(`正在生成插图 (${done + 1}/${pending}): ${q.id}`)
        asyncOp.addLog(`生成 T01 [${q.id}]: ${q.imageDesc || ''}`, 'info')
        try {
          const { svg, url } = await imageGen.generateAndPersist(
            q.imageDesc,
            q.imagePrompt,
            imageFilename(q.id),
            { signal: controller.signal, onProgress: imageGenProgress, ...getImageGenContext(q) }
          )
          await applyGeneratedImage(q, svg, url)
          done++
          storage.persistQuestions()
        } catch (e) {
          if (e.name === 'AbortError') throw e
          errors++
          asyncOp.addLog(`  ✗ T01 [${q.id}] 失败: ${e.message}`, 'error')
        }
      } else if (q.type === 'T02' && Array.isArray(q.imageOptions)) {
        for (let i = 0; i < q.imageOptions.length; i++) {
          if (controller.signal.aborted) break
          const opt = q.imageOptions[i]
          if (hasExistingImage(opt)) {
            asyncOp.addLog(`跳过 T02 [${q.id}] 选项 ${i + 1}（已有插图）`, 'info')
            continue
          }
          asyncOp.setMessage(`正在生成插图 (${done + 1}/${pending}): ${q.id} 选项${i + 1}`)
          asyncOp.addLog(`生成 T02 [${q.id}] 选项 ${i + 1}: ${opt.desc || ''}`, 'info')
          try {
            const { svg, url } = await imageGen.generateAndPersist(
              opt.desc,
              getImagePrompt(opt),
              imageFilename(q.id, `opt${i}`),
              { signal: controller.signal, onProgress: imageGenProgress, ...getImageGenContext(q, i) }
            )
            await applyGeneratedImage(opt, svg, url)
            done++
            storage.persistQuestions()
          } catch (e) {
            if (e.name === 'AbortError') throw e
            errors++
            asyncOp.addLog(`  ✗ T02 [${q.id}] 选项 ${i + 1} 失败: ${e.message}`, 'error')
          }
        }
      }
    }

    const summary = `完成！新生成 ${done} 张，跳过 ${skipped} 张${errors ? `，失败 ${errors} 张` : ''}`
    asyncOp.addLog(summary, errors ? 'warning' : 'success')
    if (done > 0 || errors > 0) {
      alert(summary)
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      asyncOp.addLog('插图生成已被取消', 'warning')
    } else {
      asyncOp.addLog(`批量生成失败: ${e.message}`, 'error')
      errorMessage.value = `插图生成失败: ${e.message}`
    }
  } finally {
    asyncOp.stop()
  }
}

async function generateImagesForCurrent() {
  const q = currentQuestion.value
  if (!q) return

  const controller = asyncOp.start(
    q.type === 'T02' ? '正在为各选项生成图片...' : '正在生成题目图片...'
  )

  try {
    clearQuestionImages(q)
    await nextTick()

    if (q.type === 'T01') {
      asyncOp.addLog(`生成 T01 图片: ${q.imageDesc || q.id}`, 'info')
      const { svg, url } = await imageGen.generateAndPersist(
        q.imageDesc,
        q.imagePrompt,
        imageFilename(q.id),
        { signal: controller.signal, onProgress: imageGenProgress, ...getImageGenContext(q) }
      )
      await applyGeneratedImage(q, svg, url)
      asyncOp.addLog('T01 图片生成完成', 'success')
    } else if (q.type === 'T02') {
      const opts = q.imageOptions || []
      for (let i = 0; i < opts.length; i++) {
        const opt = opts[i]
        asyncOp.addLog(`生成选项 ${i + 1}/${opts.length}: ${opt.desc || ''}`, 'info')
        asyncOp.setMessage(`正在生成选项 ${i + 1}/${opts.length}...`)
        const { svg, url } = await imageGen.generateAndPersist(
          opt.desc,
          getImagePrompt(opt),
          imageFilename(q.id, `opt${i}`),
          { signal: controller.signal, onProgress: imageGenProgress, ...getImageGenContext(q, i) }
        )
        await applyGeneratedImage(opt, svg, url)
      }
      asyncOp.addLog(`T02 全部 ${opts.length} 张图片生成完成`, 'success')
    } else {
      return
    }

    storage.persistQuestions()
    isDirty.value = false
  } catch (e) {
    if (e.name === 'AbortError') {
      asyncOp.addLog('图片生成已取消', 'warning')
    } else {
      asyncOp.addLog(`图片生成失败: ${e.message}`, 'error')
      errorMessage.value = `图片生成失败: ${e.message}`
    }
  } finally {
    asyncOp.stop()
  }
}

function deleteCurrentQuestion() {
  if (!currentQuestion.value) return
  const qId = currentQuestion.value.id
  if (!confirm('确认删除此题目？此操作不可恢复。')) return
  // remove from server + memory
  storage.deleteQuestions([qId])
  preview.value.questions = preview.value.questions.filter(q => q.id !== qId)
  // rebuild grouped
  preview.value.groupedQuestions.forEach(g => {
    g.questions = g.questions.filter(q => q.id !== qId)
  })
  preview.value.groupedQuestions = preview.value.groupedQuestions.filter(g => g.questions.length > 0)
  if (preview.value.currentIndex >= preview.value.questions.length) {
    preview.value.currentIndex = Math.max(0, preview.value.questions.length - 1)
  }
  isDirty.value = false
}

watch(() => currentQuestion.value?.id, (newId) => {
  isDirty.value = false
  if (newId) syncEditorFromQuestion(currentQuestion.value)
})

// 辅助：先按目标语名查找词库，再按 pair id 查找（兼容旧版迁移数据）
function getVocabForLevel(pair, level) {
  if (!pair) return ''
  let words = vocabStorage.getWords(pair.id, level)
  if (!words) {
    words = vocabStorage.getWords(pair.to, level)
  }
  return words || ''
}

function selectLang(pair) {
  try {
    if (!pair) {
      errorMessage.value = '选择语言失败：pair 对象为空'
      return
    }
    if (!pair.id) {
      errorMessage.value = `选择语言失败：pair 缺少 id (from=${pair.from}, to=${pair.to})`
      return
    }
    if (!Array.isArray(pair.cefrLevels)) {
      errorMessage.value = `语言组合 "${pair.from} → ${pair.to}" 的 CEFR 级别列表缺失或格式错误`
      return
    }
    if (pair.cefrLevels.length === 0) {
      errorMessage.value = `语言组合 "${pair.from} → ${pair.to}" 没有配置任何 CEFR 级别，请在"语言管理"中设置`
      return
    }
    
    selectedPairId.value = pair.id
    selectedLevel.value = ''
    errorMessage.value = ''
  } catch (e) {
    errorMessage.value = `选择语言时发生异常: ${e.message}`
    console.error('selectLang error:', e)
  }
}

function selectLevel(pair, level) {
  try {
    if (!pair || !level) return
    selectedLevel.value = level
    vocabStorage.registerPairId(pair.id, pair.to)
    const units = unitFramework.getFramework(pair.id, level)
    if (!Array.isArray(units)) {
      console.warn(`获取框架数据异常，预期数组，实际:`, units)
      framework.value = []
    } else {
      framework.value = units
    }
    updateCoverage()
    errorMessage.value = ''
  } catch (e) {
    errorMessage.value = `选择级别时发生异常: ${e.message}`
    console.error('selectLevel error:', e)
  }
}

function getUnitCount(lang, level) {
  const pair = languagePairs.value.find(p => p.id === lang || p.to === lang)
  const key = pair ? pair.id : lang
  return unitFramework.getFramework(key, level).length
}

// ---- 覆盖率计算 ----
function parseSectionWords(sec) {
  if (Array.isArray(sec.coveredWords)) return sec.coveredWords
  if (typeof sec.coveredWords === 'string') {
    return sec.coveredWords.split(',').map(v => v.trim()).filter(Boolean)
  }
  return []
}

function collectCoveredVocab(units) {
  const coveredVocab = new Set()
  units.forEach(unit => {
    unit.sections?.forEach(sec => {
      parseSectionWords(sec).forEach(v => coveredVocab.add(v))
    })
  })
  return coveredVocab
}

function isVocabWordCovered(word, coveredVocab) {
  return coveredVocab.has(word) || [...coveredVocab].some(c => c.toLowerCase() === word.toLowerCase())
}

function vocabCoveragePercent(vocabList, coveredVocab) {
  if (!vocabList.length) return 0
  const covered = vocabList.filter(v => isVocabWordCovered(v, coveredVocab)).length
  return Math.min(100, Math.round((covered / vocabList.length) * 100))
}

function getSectionCoverageStats(units) {
  let totalSections = 0
  let sectionsWithContent = 0
  let sectionsWithGrammar = 0
  units.forEach(unit => {
    unit.sections?.forEach(sec => {
      totalSections++
      if (parseSectionWords(sec).length > 0) sectionsWithContent++
      if (sec.grammarPoint?.trim()) sectionsWithGrammar++
    })
  })
  return { totalSections, sectionsWithContent, sectionsWithGrammar }
}

function sectionCoveragePercent(covered, total) {
  if (!total) return 0
  return Math.min(100, Math.round((covered / total) * 100))
}

function formatSectionLabel(unit, sec) {
  const title = sec.titleNative || sec.titleTarget || sec.id
  return `${unit.id}-${sec.id}: ${title}`
}

function updateCoverage() {
  try {
    if (!selectedPair.value || !selectedLevel.value) return

    const allVocab = getVocabForLevel(selectedPair.value, selectedLevel.value)
    const vocabList = allVocab.split(',').map(v => v.trim()).filter(Boolean)
    const units = Array.isArray(framework.value) ? framework.value : []
    const coveredVocab = collectCoveredVocab(units)
    const { totalSections, sectionsWithContent, sectionsWithGrammar } = getSectionCoverageStats(units)

    coverage.value = {
      vocab: vocabCoveragePercent(vocabList, coveredVocab),
      topic: sectionCoveragePercent(sectionsWithContent, totalSections),
      knowledge: sectionCoveragePercent(sectionsWithGrammar, totalSections)
    }
  } catch (e) {
    console.error('updateCoverage error:', e)
    errorMessage.value = `计算覆盖率时出错: ${e.message}`
  }
}

function showDetails(type) {
  coverageDetail.value.show = true
  if (!selectedPair.value) return

  const units = Array.isArray(framework.value) ? framework.value : []

  if (type === 'vocab') {
    coverageDetail.value.title = '未覆盖词汇'
    const allVocab = getVocabForLevel(selectedPair.value, selectedLevel.value)
    const vocabList = allVocab.split(',').map(v => v.trim()).filter(Boolean)
    const coveredVocab = collectCoveredVocab(units)
    coverageDetail.value.list = vocabList.filter(v => !isVocabWordCovered(v, coveredVocab))
  } else if (type === 'topic') {
    coverageDetail.value.title = '未分配词汇的小节'
    const list = []
    units.forEach(unit => {
      unit.sections?.forEach(sec => {
        if (parseSectionWords(sec).length === 0) list.push(formatSectionLabel(unit, sec))
      })
    })
    coverageDetail.value.list = list
  } else {
    coverageDetail.value.title = '未分配语法点的小节'
    const list = []
    units.forEach(unit => {
      unit.sections?.forEach(sec => {
        if (!sec.grammarPoint?.trim()) list.push(formatSectionLabel(unit, sec))
      })
    })
    coverageDetail.value.list = list
  }
}

// ---- 框架编辑 ----
async function generateAI() {
  const targetLang = selectedPair.value?.to
  const sourceLang = selectedPair.value?.from
  if (!targetLang || !sourceLang) {
    console.warn('generateAI: language pair info missing')
    return
  }
  const level = selectedLevel.value
  console.log('generateAI: starting for', sourceLang, '→', targetLang, level)
  
  const vocab = getVocabForLevel(selectedPair.value, level)

  const controller = asyncOp.start(`正在为 ${sourceLang} → ${targetLang} · ${level} 生成单元框架...`)
  asyncOp.addLog(`开始为 ${sourceLang} → ${targetLang} · ${level} 生成单元框架`, 'info')

  if (!vocab || vocab.trim() === '') {
    asyncOp.addLog('警告：该级别词汇库为空，建议先在词库管理中配置词汇', 'warning')
  }
  
  try {
    const units = await unitFramework.generateFrameworkWithAI(sourceLang, targetLang, level, vocab, {
      pairId: selectedPair.value.id,
      signal: controller.signal
    })
    console.log('generateAI: success, units:', units?.length)
    asyncOp.addLog(`单元框架已生成，共 ${units.length} 个关卡`, 'success')
    framework.value = units
    updateCoverage()
  } catch (e) {
    if (e.name === 'AbortError') {
      asyncOp.addLog('AI 生成已被用户取消', 'warning')
    } else {
      console.error('generateAI error:', e)
      asyncOp.addLog(`AI 生成失败: ${e.message}`, 'error')
      alert('AI 生成失败: ' + e.message)
    }
  } finally {
    asyncOp.stop()
  }
}

function saveCurrentFramework() {
  if (!selectedPair.value) return
  unitFramework.setFramework(selectedPair.value.id, selectedLevel.value, framework.value)
  updateCoverage()
}

function addUnit() {
  framework.value.push({
    id: `U${(framework.value.length + 1).toString().padStart(2, '0')}`,
    titleNative: '新关卡',
    titleTarget: 'New Unit',
    goalNative: '',
    goalTarget: '',
    vocabCount: 0,
    grammarPoints: [],
    scenarios: [],
    sections: []
  })
  saveCurrentFramework()
}

function removeUnit(idx) {
  if (confirm('确认删除该关卡？')) {
    framework.value.splice(idx, 1)
    saveCurrentFramework()
  }
}

function addSection(uIdx) {
  const unit = framework.value[uIdx]
  unit.sections.push({
    id: `S${(unit.sections.length + 1).toString().padStart(2, '0')}`,
    titleNative: '新小节',
    titleTarget: 'New Section',
    coveredWords: [],
    grammarPoint: '',
    scenario: ''
  })
  saveCurrentFramework()
}

function removeSection(uIdx, sIdx) {
  framework.value[uIdx].sections.splice(sIdx, 1)
  saveCurrentFramework()
}

function toggleSectionDetail(uIdx, sIdx) {
  const key = `${uIdx}-${sIdx}`
  const set = new Set(expandedSections.value)
  if (set.has(key)) set.delete(key)
  else set.add(key)
  expandedSections.value = set
}

function getExistingSectionQuestions(unit, sec) {
  const pairId = selectedPairId.value
  if (!pairId) return []
  return storage.getQuestions().filter(q => questionMatchesSection(q, pairId, unit.id, sec.id))
}

function hasSectionQuestions(unit, sec) {
  return getExistingSectionQuestions(unit, sec).length > 0
}

function normalizeWords(sec) {
  if (typeof sec.coveredWords === 'string') {
    sec.coveredWords = sec.coveredWords.split(',').map(v => v.trim()).filter(Boolean)
  }
  saveCurrentFramework()
}

function calculateCoverage(pair, level) {
  if (!pair) return { vocab: 0 }
  const allVocab = getVocabForLevel(pair, level)
  const vocabList = allVocab.split(',').map(v => v.trim()).filter(Boolean)
  const units = unitFramework.getFramework(pair.id, level)
  const coveredVocab = collectCoveredVocab(units)
  return { vocab: vocabCoveragePercent(vocabList, coveredVocab) }
}

function prepareQuestionsForSave(questions, unit, sec, sourceLang, targetLang, level) {
  const pairId = selectedPairId.value
  const sectionId = buildSectionId(pairId, unit.id, sec.id)
  const total = questions.length
  const valid = []

  for (let i = 0; i < questions.length; i++) {
    const normalized = normalizeQuestion(questions[i], {
      pairId,
      sectionId,
      unit: unit.id,
      level,
      sourceLang,
      targetLang,
      pairFrom: sourceLang
    })
    const { errors, warnings } = validateQuestion(normalized)
    const label = normalized.id || `题目${i + 1}`

    for (const w of warnings) {
      asyncOp.addLog(`  ⚠ ${label}: ${w}`, 'warning')
    }
    if (errors.length > 0) {
      for (const e of errors) {
        asyncOp.addLog(`  ✗ ${label}: ${e}`, 'error')
      }
      continue
    }

    const shuffled = shuffleOptions(normalized)
    valid.push({
      ...shuffled,
      id: shuffled.id || `${targetLang.toLowerCase()}-${level.toLowerCase()}-${unit.id.toLowerCase()}-${sec.id.toLowerCase()}-${String(valid.length + 1).padStart(3, '0')}`
    })
  }

  if (total > 0) {
    asyncOp.addLog(`  校验通过 ${valid.length}/${total} 道`, valid.length === total ? 'success' : 'warning')
  }
  return valid
}

// ---- AI 生成题目 ----
async function generateQuestions() {
  const targetLang = selectedPair.value?.to
  const sourceLang = selectedPair.value?.from
  const level = selectedLevel.value
  if (!targetLang || !sourceLang || !level) {
    alert('请先选择语言和级别')
    return
  }
  if (!framework.value.length) {
    alert('请先生成单元框架')
    return
  }

  const controller = asyncOp.start(`正在生成题目...`)
  asyncOp.addLog(`开始为 ${sourceLang} → ${targetLang} · ${level} 生成题目`, 'info')

  let totalSections = 0
  let totalGenerated = 0

  try {
    for (const unit of framework.value) {
      for (const sec of (unit.sections || [])) {
        if (!sec.titleTarget && !sec.titleNative) continue
        totalSections++
        asyncOp.addLog(`生成 [${unit.id}-${sec.id}] ${sec.titleTarget || sec.titleNative} 的题目...`, 'info')

        const questions = await generateQuestionsForSection(unit, sec, sourceLang, targetLang, level, controller.signal)
        if (questions && questions.length) {
          const questionsWithSection = prepareQuestionsForSave(questions, unit, sec, sourceLang, targetLang, level)
          if (questionsWithSection.length) {
            const existing = getExistingSectionQuestions(unit, sec)
            if (existing.length) storage.deleteQuestions(existing.map(q => q.id))
            storage.saveQuestions(questionsWithSection)
            totalGenerated += questionsWithSection.length
            asyncOp.addLog(`  ✓ 已保存 ${questionsWithSection.length} 道题目`, 'success')
          }
        }
      }
    }
    asyncOp.addLog(`完成！共为 ${totalSections} 个小节生成 ${totalGenerated} 道题目`, 'success')
    if (totalGenerated > 0) {
      alert(`AI 生成完成！共为 ${totalSections} 个小节生成 ${totalGenerated} 道题目`)
    } else {
      alert('未生成任何题目，请检查 API 配置和日志详情')
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      asyncOp.addLog('题目生成已被取消', 'warning')
    } else {
      asyncOp.addLog(`生成失败: ${e.message}`, 'error')
      console.error(e)
    }
  } finally {
    asyncOp.stop()
  }
}

// ---- 为单个关卡生成题目 ----
async function generateQuestionsForUnit(uIdx) {
  const unit = framework.value[uIdx]
  const targetLang = selectedPair.value?.to
  const sourceLang = selectedPair.value?.from
  const level = selectedLevel.value
  if (!targetLang || !sourceLang || !level) {
    alert('请先选择语言和级别')
    return
  }
  if (!unit.sections?.length) {
    alert('该关卡没有小节')
    return
  }

  const controller = asyncOp.start(`正在生成 [${unit.id}] 的题目...`)
  asyncOp.addLog(`开始为 ${unit.titleTarget || unit.titleNative} 生成题目`, 'info')

  let totalGenerated = 0
  try {
    for (const sec of unit.sections) {
      if (!sec.titleTarget && !sec.titleNative) continue
      asyncOp.addLog(`生成 [${unit.id}-${sec.id}] ${sec.titleTarget || sec.titleNative} 的题目...`, 'info')

      const questions = await generateQuestionsForSection(unit, sec, sourceLang, targetLang, level, controller.signal)
      if (questions?.length) {
        const questionsWithSection = prepareQuestionsForSave(questions, unit, sec, sourceLang, targetLang, level)
        if (questionsWithSection.length) {
          const existing = getExistingSectionQuestions(unit, sec)
          if (existing.length) storage.deleteQuestions(existing.map(q => q.id))
          storage.saveQuestions(questionsWithSection)
          totalGenerated += questionsWithSection.length
          asyncOp.addLog(`  ✓ 已保存 ${questionsWithSection.length} 道题目`, 'success')
        }
      }
    }
    asyncOp.addLog(`完成！共生成 ${totalGenerated} 道题目`, 'success')
    if (totalGenerated === 0) {
      alert('未生成任何题目，请检查 API 配置和日志详情')
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      asyncOp.addLog('题目生成已被取消', 'warning')
    } else {
      asyncOp.addLog(`生成失败: ${e.message}`, 'error')
      console.error(e)
    }
  } finally {
    asyncOp.stop()
  }
}

// ---- 为单个小节生成题目 ----
async function generateQuestionsForSectionOnly(uIdx, sIdx) {
  const unit = framework.value[uIdx]
  const sec = unit.sections[sIdx]
  const targetLang = selectedPair.value?.to
  const sourceLang = selectedPair.value?.from
  const level = selectedLevel.value
  if (!targetLang || !sourceLang || !level) {
    alert('请先选择语言和级别')
    return
  }

  const controller = asyncOp.start(`正在生成 [${unit.id}-${sec.id}] 的题目...`)
  asyncOp.addLog(`开始为 ${sec.titleTarget || sec.titleNative} 生成题目`, 'info')

  try {
    const questions = await generateQuestionsForSection(unit, sec, sourceLang, targetLang, level, controller.signal)
    if (questions?.length) {
      const questionsWithSection = prepareQuestionsForSave(questions, unit, sec, sourceLang, targetLang, level)
      if (questionsWithSection.length) {
        const existing = getExistingSectionQuestions(unit, sec)
        if (existing.length) storage.deleteQuestions(existing.map(q => q.id))
        storage.saveQuestions(questionsWithSection)
        asyncOp.addLog(`完成！生成了 ${questionsWithSection.length} 道题目`, 'success')
        alert(`已生成 ${questionsWithSection.length} 道题目`)
      } else {
        asyncOp.addLog('全部题目未通过校验，未保存', 'warning')
        alert('生成的题目均未通过校验，请查看日志详情')
      }
    } else {
      asyncOp.addLog('未生成任何题目', 'warning')
      alert('未生成任何题目，请检查 API 配置和日志详情')
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      asyncOp.addLog('题目生成已被取消', 'warning')
    } else {
      asyncOp.addLog(`生成失败: ${e.message}`, 'error')
      console.error(e)
    }
  } finally {
    asyncOp.stop()
  }
}

async function generateQuestionsForSection(unit, sec, sourceLang, targetLang, level, signal) {
  const typeIds = CEFR_TYPE_MAP[level] || CEFR_TYPE_MAP['A1']
  const suitableTypes = typeStorage.types.value.filter(t => typeIds.includes(t.id))
  if (!suitableTypes.length) {
    asyncOp.addLog(`  无适合 ${level} 级别的题型可用`, 'warning')
    return []
  }

  const selectedTypes = [...suitableTypes].sort(() => Math.random() - 0.5).slice(0, 3)
  const vocabWords = Array.isArray(sec.coveredWords) ? sec.coveredWords.join(', ') : (sec.coveredWords || '')

  const prompt = `你是一位专业的语言教学专家。请为以下语言课程小节生成练习题。

学习方向: ${sourceLang}（母语/源语言） → ${targetLang}（目标语言/学习语言）
目标语言: ${targetLang}
源语言: ${sourceLang}
级别: ${level}
单元: ${unit.titleTarget || unit.titleNative}
小节: ${sec.titleTarget || sec.titleNative}
语法点: ${sec.grammarPoint || '通用'}
场景: ${sec.scenario || '日常对话'}
词汇范围: ${vocabWords || '基础词汇'}

【绝对语言约束 - 违反此约束的输出将被拒绝】
目标语言是 ${targetLang}，所有要求用"${targetLang}"书写的字段，必须且只能使用 ${targetLang}，严禁混入任何其他语言（如西班牙语、法语、德语等）。如果你输出了非 ${targetLang} 的内容，该题目将被判定为错误。

可用题型（请混合使用不同题型）：
${selectedTypes.map(t => `- ${t.id} (${t.title}): ${t.description}`).join('\n')}

【重要 - 双语要求】
学习者是${sourceLang}母语者学习${targetLang}，因此题目必须包含双语内容：
- T01 图片题: imageDesc 用${sourceLang}（必须描绘正确答案 options[answerIdx] 的场景）；imagePrompt 用英文写 SVG 可画要素（主体+动作+道具，禁止 4k/光影/Midjourney 术语）；选项用${targetLang}
- T02 听音选图: 每项 imageOptions 含 desc（${sourceLang}）+ prompt（英文 SVG 要素）；四张图场景/主体/主色必须互不相同；audioText 用${targetLang}
- T03 配对题: left 用${targetLang}，right 用${sourceLang}翻译（帮助学习者理解含义）
- T05 补全句子: sentence 用${targetLang}，但 hint（提示）必须用${sourceLang}解释语法点
- T07 翻译选择: sourceText 用${sourceLang}，选项用${targetLang}（将母语翻译成目标语）
- T08 听力选择: audioText 用${targetLang}，question 和 options 用${sourceLang}
- T09 拼写输入: audioText/hint 用${sourceLang}说明，answer 为${targetLang}单词
- T10 翻译输入: sourceText 用${sourceLang}，acceptedAnswers 为${targetLang}
- T12 情景回应: scenario 用${sourceLang}描述情景，选项用${targetLang}

要求：
1. 每道题须包含以下公共字段：id, type, typeName, language, cefr, unit, unitTheme, difficulty, tags
2. 每道题额外包含该题型特有字段（如 options, answerIdx, sentence 等）
   - T05 必须含 blank（填空答案）和 options、answerIdx
   - T07/T10 必须含 sourceLang（源语言代码: ${sourceLang === '中文' ? 'zh' : sourceLang === 'English' ? 'en' : 'es'}）
   - T06 必须含 words（数组）和 targetSentence（完整目标句）
   - T03 必须含 pairs 数组，每项为 {"left":"...","right":"..."}
3. difficulty 为 1-5 的整数
4. tags 为字符串数组
5. id 格式: "${targetLang.toLowerCase()}-${level.toLowerCase()}-${unit.id.toLowerCase()}-${sec.id.toLowerCase()}-{序号}"

请生成 5 道练习题，混合使用不同题型，返回 JSON 数组。
只输出 JSON 数组，不包含任何其他文字。`

  try {
    let tokensReceived = 0
    const result = await llm.callLLMForJSON(prompt, { 
      signal, 
      temperature: 0.3, 
      onStreamProgress: (content, reasoning) => {
        const currentLength = (content || '').length + (reasoning || '').length
        if (currentLength > tokensReceived) {
          tokensReceived = currentLength
          if (tokensReceived % 5 === 0 || tokensReceived <= 3) {
            asyncOp.setMessage(`生成中... 已接收 ${tokensReceived} 个 token`)
          }
        }
      }
    })
    return Array.isArray(result) ? result : []
  } catch (e) {
    if (e.name !== 'AbortError') {
      asyncOp.addLog(`  生成 [${sec.id}] 失败: ${e.message}`, 'error')
    }
    return []
  }
}

// ---- 题目预览 ----
function previewUnit(uIdx, sIdx = -1) {
  const unit = framework.value[uIdx]
  const pairId = selectedPairId.value
  const allQuestions = storage.getQuestions()
  
  const grouped = []
  const flat = []
  
  unit.sections.forEach((sec, idx) => {
    const sectionId = buildSectionId(pairId, unit.id, sec.id)
    const secsQs = allQuestions.filter(q => questionMatchesSection(q, pairId, unit.id, sec.id))
    if (secsQs.length) {
      grouped.push({
        id: sectionId,
        name: sec.titleTarget || sec.titleNative,
        questions: secsQs
      })
      flat.push(...secsQs)
    }
  })

  let startIdx = 0
  if (sIdx !== -1) {
    const targetSec = unit.sections[sIdx]
    const firstIdx = flat.findIndex(q => questionMatchesSection(q, pairId, unit.id, targetSec.id))
    if (firstIdx !== -1) startIdx = firstIdx
  }

  preview.value = {
    show: true,
    unitIdx: uIdx,
    questions: flat,
    groupedQuestions: grouped,
    currentIndex: startIdx,
    unitName: unit.titleTarget || unit.titleNative,
    sectionName: grouped[0]?.name || '',
    showAnswer: false
  }
  updatePreviewSectionName()
}

function updatePreviewSectionName() {
  const q = currentQuestion.value
  if (!q) return
  const sec = preview.value.groupedQuestions.find(g => g.id === q.sectionId)
  preview.value.sectionName = sec ? sec.name : ''
}

function selectQuestion(group, qIdx) {
  const flatIdx = preview.value.questions.findIndex(q => q.id === group.questions[qIdx].id)
  if (flatIdx !== -1) {
    preview.value.currentIndex = flatIdx
    updatePreviewSectionName()
  }
}

function getFlatIndex(group, qIdx) {
  return preview.value.questions.findIndex(q => q.id === group.questions[qIdx].id)
}

function closePreview() {
  preview.value.show = false
}

function prevQuestion() {
  if (preview.value.currentIndex > 0) {
    preview.value.currentIndex--
    updatePreviewSectionName()
  }
}

function nextQuestion() {
  if (preview.value.currentIndex < preview.value.questions.length - 1) {
    preview.value.currentIndex++
    updatePreviewSectionName()
  }
}

function displayFields(q) {
  const skip = ['id', 'type', 'typeName', 'language', 'cefr', 'unit', 'sectionId', 'pairId', 'unitTheme', 'difficulty', 'tags', 'status']
  return Object.fromEntries(Object.entries(q).filter(([k]) => !skip.includes(k)))
}

function fieldLabel(key) {
  const map = {
    imageDesc: '图片描述', imagePrompt: '绘图提示词', imageSvg: 'SVG 源码', imageUrl: '图片地址',
    options: '选项', answerIdx: '答案索引',
    audioText: '听力文本', imageOptions: '图片选项', pairs: '配对', sentence: '句子',
    blank: '填空答案', words: '单词列表', targetSentence: '目标句', sourceText: '源文本',
    sourceLang: '源语言', question: '问题', hint: '提示', answer: '正确答案',
    commonMistakes: '常见错误', acceptedAnswers: '可接受答案', scoringDimensions: '评分维度',
    difficultyNotes: '难度说明', scenario: '场景', pragmaticsNote: '语用说明'
  }
  return map[key] || key
}

function formatFieldValue(val) {
  if (Array.isArray(val)) return val.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(', ')
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function getAnswerText(q) {
  if (!q) return ''
  switch (q.type) {
    case 'T01':
    case 'T07':
    case 'T08':
    case 'T12':
      return q.options?.[q.answerIdx] ?? `选项 ${q.answerIdx}`
    case 'T02':
      return q.imageOptions?.[q.answerIdx]?.desc ?? `图片 ${q.answerIdx}`
    case 'T03':
      return q.pairs?.map(p => `${p.left} ↔ ${p.right}`).join('; ') || ''
    case 'T05':
      return q.blank || ''
    case 'T06':
      return q.targetSentence || ''
    case 'T09':
      return q.answer || ''
    case 'T10':
      return q.acceptedAnswers?.join(' / ') || ''
    case 'T11':
      return q.audioText || ''
    default:
      return q.answer || q.options?.[q.answerIdx] || ''
  }
}

function speak(text) {
  if (!text || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  // 尝试匹配目标语言
  const lang = currentQuestion.value?.language
  if (lang === 'es') utterance.lang = 'es-ES'
  else if (lang === 'zh') utterance.lang = 'zh-CN'
  else if (lang === 'en') utterance.lang = 'en-US'
  else utterance.lang = lang || 'en-US'
  utterance.rate = 0.85
  window.speechSynthesis.speak(utterance)
}

onMounted(() => {
  if (languagePairs.value.length > 0 && !selectedPairId.value) {
    const first = languagePairs.value[0]
    if (first && first.id) {
      selectedPairId.value = first.id
    }
  }
  if (selectedPairId.value && route.query.level) {
    const pair = languagePairs.value.find(p => p.id === selectedPairId.value)
    const level = String(route.query.level)
    if (pair?.cefrLevels?.includes(level)) {
      selectLevel(pair, level)
    }
  }
})
</script>

<style scoped>
.bank-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 24px;
  height: calc(100vh - 120px);
}
.bank-sidebar {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow-y: auto;
}
.lang-group {
  border-bottom: 1px solid var(--border);
}
.lang-node {
  padding: 12px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  transition: all 0.2s;
}
.lang-node:hover { background: var(--bg); }
.lang-node.active {
  background: var(--green-bg);
  color: var(--green);
}
.level-list {
  padding: 4px 0 12px;
}
.level-node {
  padding: 6px 16px 6px 40px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-light);
  transition: all 0.2s;
}
.level-node:hover { background: var(--bg); }
.level-node.active {
  color: var(--green);
  font-weight: 600;
  background: var(--green-bg);
}

.bank-main {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  overflow-y: auto;
}

/* 概览视图 */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 20px;
}
.overview-card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card-title { font-weight: 700; font-size: 16px; }
.card-stats {
  display: flex;
  gap: 16px;
}
.stat-item {
  display: flex;
  flex-direction: column;
}
.stat-val { font-size: 18px; font-weight: 700; color: var(--green); }
.stat-label { font-size: 11px; color: var(--text-light); }

/* 详情视图 */
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.header-actions {
  display: flex;
  gap: 10px;
}
.coverage-panel {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}
.coverage-item {
  padding: 16px;
  background: var(--bg);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.coverage-item:hover { background: var(--border-light); }
.cov-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}
.cov-bar {
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}
.cov-fill {
  height: 100%;
  background: var(--green);
  transition: width 0.3s ease;
}

.framework-editor {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.unit-block {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  background: #fafafa;
}
.unit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.unit-title-input {
  font-size: 18px;
  font-weight: 700;
  border: none;
  background: transparent;
  outline: none;
  width: 80%;
}
.unit-goal-input {
  width: 100%;
  padding: 8px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 16px;
}
.sections-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.section-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.section-main { flex: 1; }
.section-title-input {
  width: 100%;
  font-weight: 600;
  border: none;
  outline: none;
}
.section-meta {
  display: flex;
  gap: 8px;
}
.meta-input {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  width: 120px;
}

.empty-state {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
.empty-content {
  text-align: center;
  color: var(--text-light);
}
.empty-icon { font-size: 48px; display: block; margin-bottom: 12px; }

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  backdrop-filter: blur(4px);
}
.modal {
  background: var(--white);
  padding: 24px;
  border-radius: 12px;
  width: 400px;
}
.detail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}
.detail-item {
  padding: 8px;
  background: var(--bg);
  border-radius: 4px;
  font-size: 13px;
}
.empty-text { text-align: center; color: var(--text-light); padding: 20px; }

.preview-container {
  display: flex;
  width: 90vw;
  height: 90vh;
  background: var(--white);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0,0,0,0.3);
}
.preview-sidebar {
  width: 260px;
  background: #fdfdfd;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.preview-sidebar-header {
  padding: 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-info h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.header-info p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-light);
}
.btn-close-sidebar {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-light);
}
.preview-sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.preview-group {
  margin-bottom: 24px;
}
.preview-group-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-light);
  margin-bottom: 8px;
  padding-left: 8px;
  text-transform: uppercase;
}
.preview-q-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.preview-q-item {
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.2s;
  font-size: 13px;
}
.preview-q-item:hover { background: var(--bg); }
.preview-q-item.active {
  background: var(--green-bg);
  color: var(--green);
  font-weight: 600;
}
.q-idx {
  font-family: monospace;
  font-size: 11px;
  width: 20px;
  opacity: 0.6;
}
.q-type-tag {
  font-size: 10px;
  background: #eee;
  padding: 2px 6px;
  border-radius: 4px;
  color: #666;
}
.preview-main {
  width: 420px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f0f2f5;
}

/* ---- 中间编辑面板 ---- */
.preview-editor {
  flex: 1;
  min-width: 340px;
  background: var(--white);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.editor-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.editor-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.editor-type-badge {
  background: var(--green-bg);
  color: var(--green);
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
}
.editor-id {
  font-size: 11px;
  color: var(--text-lighter);
  font-family: monospace;
}
.editor-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
  border-radius: 6px;
}
.btn-danger {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-danger:hover { background: #fecaca; }
.editor-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.editor-section {
  margin-bottom: 12px;
}
.editor-section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-light);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #f0f0f0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.editor-field {
  margin-bottom: 8px;
}
.editor-field label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-light);
  margin-bottom: 3px;
}
.editor-field input,
.editor-field select,
.editor-field textarea {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.15s;
  background: #fafafa;
}
.editor-field input:focus,
.editor-field select:focus,
.editor-field textarea:focus {
  outline: none;
  border-color: var(--green);
  background: white;
}
.editor-field textarea {
  resize: vertical;
  min-height: 60px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
}
.inline-edit {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.inline-edit input {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 12px;
  font-family: inherit;
  background: #fafafa;
}
.inline-edit input:focus {
  outline: none;
  border-color: var(--green);
  background: white;
}
.editor-dirty-bar {
  padding: 8px 16px;
  background: #fffbeb;
  border-top: 1px solid #fde68a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #92400e;
  flex-shrink: 0;
}
.editor-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-light);
  gap: 8px;
}
.editor-empty-icon { font-size: 48px; }
.editor-empty-hint { font-size: 12px; opacity: 0.7; }

.phone-frame {
  width: 375px;
  height: 760px;
  background: #f8f9fa;
  border: 12px solid #222;
  border-radius: 40px;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}
.phone-notch {
  width: 150px;
  height: 24px;
  background: #222;
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  z-index: 10;
}
.phone-header {
  padding: 32px 20px 16px;
  background: var(--white);
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.phone-title {
  font-size: 18px;
  font-weight: 700;
  color: #333;
}
.phone-subtitle {
  font-size: 12px;
  color: var(--text-light);
  margin-top: 4px;
}
.phone-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.phone-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-light);
}
.phone-empty-hint {
  font-size: 12px;
  margin-top: 8px;
  opacity: 0.7;
}
.phone-question {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.q-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-light);
  text-align: center;
}
.q-card {
  background: var(--white);
  border: 2px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.q-type-badge {
  align-self: flex-start;
  background: var(--green-bg);
  color: var(--green);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
}
.q-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.q-image-placeholder {
  width: 100%;
  height: 160px;
  background: #eee;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
  font-size: 14px;
  color: #666;
  border: 2px dashed #ccc;
}
.q-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.q-opt-btn {
  padding: 12px;
  background: var(--white);
  border: 2px solid var(--border);
  border-radius: 12px;
  text-align: center;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}
.q-opt-btn:hover { border-color: var(--green); background: var(--green-bg); }
.q-opt-btn.is-correct {
  border-color: #22c55e;
  background: #dcfce7;
  color: #15803d;
  font-weight: 600;
}
.q-render-t03 .q-pairs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.q-pair-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.q-pair-item {
  padding: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  text-align: center;
}
.q-render-t05 .q-sentence {
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 16px;
}
.q-render-t06 .q-word-pool {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 16px;
}
.q-word-chip {
  padding: 6px 12px;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.q-answer-text {
  text-align: center;
  font-weight: 600;
  color: var(--green);
  padding: 8px;
  background: var(--green-bg);
  border-radius: 8px;
}
.q-render-t07 .q-source-text {
  font-size: 18px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 16px;
  color: #333;
}

/* T02: 听音选图 */
.q-audio-hint {
  text-align: center;
  padding: 10px;
  background: var(--blue-bg, #ddf4ff);
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 12px;
  color: #1873a8;
}
.q-image-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.q-image-opt {
  border: 2px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}
.q-image-opt:hover { border-color: var(--green); }
.q-image-opt.is-correct {
  border-color: #22c55e;
  background: #dcfce7;
}
.q-image-placeholder.small {
  height: 80px;
  font-size: 12px;
  border: none;
}

/* T08: 听力选择 */
.q-question-text {
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 12px;
  color: #333;
}

/* T09: 拼写输入 */
.q-render-t09 .q-hint-text,
.q-render-t10 .q-hint-text,
.q-render-t11 .q-hint-text {
  text-align: center;
  padding: 10px;
  background: var(--orange-bg, #fff0d6);
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 10px;
  color: #8a5a00;
}
.q-mistakes, .q-scoring, .q-accepted-answers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 8px;
  background: var(--bg);
  border-radius: 8px;
  margin-top: 8px;
  font-size: 12px;
}
.mistakes-label, .scoring-label, .accepted-label {
  font-weight: 600;
  color: var(--text-light);
  margin-right: 4px;
}
.mistake-chip {
  background: var(--red-bg);
  color: #b91c1c;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.scoring-chip {
  background: var(--blue-bg, #ddf4ff);
  color: #1873a8;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.accepted-chip {
  background: var(--green-bg);
  color: #15803d;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

/* T10: 翻译输入 */
.q-render-t10 .q-source-lang {
  text-align: center;
  font-size: 12px;
  color: var(--text-light);
  margin-top: -10px;
  margin-bottom: 12px;
}

/* T11: 语音跟读 */
.q-read-aloud {
  text-align: center;
  font-size: 14px;
  color: var(--text-light);
  margin-bottom: 8px;
}
.q-read-text {
  font-size: 20px;
  font-weight: 700;
  text-align: center;
  padding: 16px;
  background: var(--bg);
  border-radius: 12px;
  margin-bottom: 12px;
  color: #333;
}

/* T12: 情景回应 */
.q-scenario {
  font-size: 14px;
  padding: 12px;
  background: var(--purple-bg, #ede9fe);
  border-radius: 10px;
  margin-bottom: 12px;
  color: #5b21b6;
  line-height: 1.5;
}
.q-pragmatics {
  text-align: center;
  padding: 8px;
  background: var(--bg);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-light);
  margin-top: 8px;
}
.q-answer-box {
  margin-top: 12px;
  padding: 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.q-answer-label { font-size: 11px; color: #166534; font-weight: 600; }
.q-answer-value { font-size: 14px; color: #15803d; font-weight: 600; }
.q-footer-controls {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}
.btn-tts {
  padding: 8px 16px;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-tts:hover { background: var(--bg); }
.btn-answer {
  padding: 8px 16px;
  background: var(--green);
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-answer:hover { filter: brightness(1.1); }
.phone-footer {
  padding: 20px;
  background: var(--white);
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.phone-nav-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--white);
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.phone-nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.phone-nav-btn:not(:disabled):hover { background: var(--bg); }


/* 单元编辑器新样式 */
.unit-title-group {
  display: flex;
  gap: 12px;
  flex: 1;
}
.unit-title-input.target,
.unit-goal-input.target {
  color: var(--green);
}
.unit-title-input.target::placeholder,
.unit-goal-input.target::placeholder {
  color: var(--text-lighter);
}
.unit-meta-tags {
  display: flex;
  gap: 8px;
  align-items: center;
}
.unit-badge {
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-light);
  font-weight: 600;
}
.unit-goals {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}
.unit-goal-input.target {
  color: var(--green);
}
.unit-grammar-scenarios {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: 6px;
}
.meta-tags {
  font-size: 12px;
  color: var(--text-light);
}
.tag-purple-sm { background: #ede9fe; color: #6d28d9; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
.tag-green-sm { background: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
.section-item { padding: 0; }
.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.section-header:hover { background: var(--bg); }
.section-id {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-lighter);
  min-width: 32px;
}
.section-main { flex: 1; display: flex; gap: 8px; align-items: center; }
.section-title { font-weight: 600; font-size: 14px; }
.section-title-target { color: var(--green); font-size: 13px; }
.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  font-size: 12px;
}
.word-count { color: var(--text-light); font-weight: 600; }
.expand-icon { color: var(--text-lighter); font-size: 10px; }
.section-detail {
  padding: 12px 16px;
  background: var(--bg);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.detail-row { display: flex; flex-direction: column; gap: 4px; }
.detail-row label { font-size: 11px; font-weight: 600; color: var(--text-light); }
.detail-row input {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;
}
.word-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.word-chip {
  background: #dcfce7;
  color: #15803d;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

/* Error Toast */
.toast-error {
  position: fixed;
  top: 20px;
  right: 20px;
  background: #dc2626;
  color: white;
  padding: 12px 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 9999;
  box-shadow: 0 8px 20px rgba(220, 38, 38, 0.3);
  animation: slideIn 0.3s ease;
}
.toast-error button {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 16px;
  opacity: 0.7;
}
.toast-error button:hover { opacity: 1; }
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
</style>
