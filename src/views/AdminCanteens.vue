<script setup lang="ts">
import { reactive, watchEffect } from 'vue'
import { useFoodStore, type AreaKind, type Campus } from '@/store/food'
import { useAuthStore } from '@/store/auth'
import FormField from '@/components/FormField.vue'

const food = useFoodStore()
const auth = useAuthStore()
const form = reactive({
  name: '',
  campus: '良乡校区' as Campus,
  kind: '食堂' as AreaKind,
  description: ''
})
const editForm = reactive({
  id: '',
  name: '',
  campus: '良乡校区' as Campus,
  kind: '食堂' as AreaKind,
  description: '',
  show: false
})

watchEffect(() => {
  form.campus = auth.user.value?.defaultCampus ?? '良乡校区'
})

async function submitArea() {
  if (!auth.requireLogin()) return
  if (!form.name.trim()) {
    window.$message.warning('区域名称不能为空')
    return
  }

  await food.addArea({
    name: form.name.trim(),
    campus: form.campus,
    kind: form.kind,
    description: form.description.trim() || '区域说明待补充。'
  })

  form.name = ''
  form.description = ''
  window.$message.success('区域已创建')
}

function openEditArea(area: { id: string; name: string; campus: Campus; kind: AreaKind; description: string }) {
  if (!auth.requireLogin()) return
  editForm.id = area.id
  editForm.name = area.name
  editForm.campus = area.campus
  editForm.kind = area.kind
  editForm.description = area.description
  editForm.show = true
}

async function submitEditArea() {
  if (!auth.requireLogin()) return
  if (!editForm.name.trim()) {
    window.$message.warning('区域名称不能为空')
    return
  }

  await food.updateArea(editForm.id, {
    name: editForm.name.trim(),
    campus: editForm.campus,
    kind: editForm.kind,
    description: editForm.description.trim()
  })
  editForm.show = false
  window.$message.success('区域已更新')
}
</script>

<template>
  <div class="page-container">
    <n-space vertical size="large">
      <n-card title="区域管理">
        <n-alert type="warning" :show-icon="false">
          区域是外层结构，比如食堂、宿舍楼下或商业区。点进区域后可以查看它包含的店面列表。
        </n-alert>
      </n-card>

      <n-card title="新建区域">
        <n-space v-if="auth.user.value" vertical>
          <FormField label="区域名称" example="北食堂、甘棠园D栋 7D">
            <n-input v-model:value="form.name" />
          </FormField>
          <FormField label="校区" example="良乡校区">
            <n-radio-group v-model:value="form.campus">
              <n-space>
                <n-radio value="良乡校区">良乡校区</n-radio>
                <n-radio value="中关村校区">中关村校区</n-radio>
              </n-space>
            </n-radio-group>
          </FormField>
          <FormField label="区域类型" example="食堂、宿舍楼下、商业区">
            <n-select
              v-model:value="form.kind"
              :options="[
                { label: '食堂', value: '食堂' },
                { label: '宿舍楼下', value: '宿舍楼下' },
                { label: '商业区', value: '商业区' },
                { label: '其他地点', value: '其他地点' }
              ]"
            />
          </FormField>
          <FormField label="区域说明" example="靠近静园宿舍南侧，共三层，常说北一、北二、北三">
            <n-input v-model:value="form.description" type="textarea" :autosize="{ minRows: 3 }" />
          </FormField>
          <n-button type="primary" block @click="submitArea">创建区域</n-button>
        </n-space>
        <n-result v-else status="403" title="请先登录" description="登录后可以补充食堂区和区域。">
          <template #footer>
            <n-button type="primary" @click="auth.authModal.value = true">登录</n-button>
          </template>
        </n-result>
      </n-card>

      <n-card title="现有区域">
        <n-space vertical>
          <n-card v-for="area in food.areas.value" :key="area.id" size="small">
            <n-space justify="space-between" align="center">
              <div>
                <strong>{{ area.name }}</strong>
                <div class="muted">{{ area.description }}</div>
              </div>
              <n-space>
                <n-tag type="info" round>{{ area.campus }}</n-tag>
                <n-tag round>{{ area.kind }}</n-tag>
                <n-button v-if="auth.user.value" size="small" tertiary @click="openEditArea(area)">修改</n-button>
              </n-space>
            </n-space>
          </n-card>
        </n-space>
      </n-card>
    </n-space>

    <n-modal v-model:show="editForm.show" preset="card" title="修改区域" style="max-width: 520px;">
      <n-space vertical>
        <FormField label="区域名称" example="北食堂、甘棠园D栋 7D">
          <n-input v-model:value="editForm.name" />
        </FormField>
        <FormField label="校区" example="良乡校区">
          <n-radio-group v-model:value="editForm.campus">
            <n-space>
              <n-radio value="良乡校区">良乡校区</n-radio>
              <n-radio value="中关村校区">中关村校区</n-radio>
            </n-space>
          </n-radio-group>
        </FormField>
        <FormField label="区域类型" example="食堂、宿舍楼下、商业区">
          <n-select
            v-model:value="editForm.kind"
            :options="[
              { label: '食堂', value: '食堂' },
              { label: '宿舍楼下', value: '宿舍楼下' },
              { label: '商业区', value: '商业区' },
              { label: '其他地点', value: '其他地点' }
            ]"
          />
        </FormField>
        <FormField label="区域说明" example="靠近静园宿舍南侧，共三层，常说北一、北二、北三">
          <n-input v-model:value="editForm.description" type="textarea" :autosize="{ minRows: 3 }" />
        </FormField>
        <n-button type="primary" block @click="submitEditArea">保存修改</n-button>
      </n-space>
    </n-modal>
  </div>
</template>
