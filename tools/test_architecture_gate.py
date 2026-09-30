#!/usr/bin/env python3
"""架构看门狗门控自测（2026-09-30 接入 tools/smoke.sh）：证明第 5 道防线不是空转。

背景：用户 2026-09-30 采纳参考卡「no academic citations embedded in project」口径——源码只写机制，
论文名 / 期刊缩写 / arXiv / DOI 只许存 docs/plans/llm-campaign.md §10。本自测喂三类样本：
  1. 引用形态（论文名 / 预印本号 / DOI / et al.）必须被拦下，且报错行号指向那一行；
  2. 机制术语（「滑动窗口关键帧压缩」这类）必须放行；
  3. 仓库现状必须零命中，而且扫描面不能是空的（文件数太少 = glob 写坏了在静默空转，直接判失败）。

用法：python3 tools/test_architecture_gate.py    # 0 全过；1 有失败
"""
import importlib.util
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
failures = []


def load_gate():
    spec = importlib.util.spec_from_file_location('arch_gate', ROOT / 'tools' / 'check_architecture.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)   # 脚本本体只定义函数（main 受 __main__ 守卫），import 无副作用
    return mod


def case(name, fn):
    try:
        fn()
    except AssertionError as e:
        failures.append(f'{name}：{e}')
        print(f'  ✗ {name}：{e}')
    else:
        print(f'  ✓ {name}')


def main():
    gate = load_gate()
    tmp = tempfile.TemporaryDirectory(prefix='arch-gate-')

    def write(fname, text):
        p = pathlib.Path(tmp.name) / fname
        p.write_text(text, encoding='utf-8')
        return p

    def expect_hit(name, text, needle):
        def run():
            p = write(f'bad_{name}.mjs', text)
            bad, n = gate.check_citations([p])
            assert n == 1, f'扫描面应为 1 个文件，实际 {n}'
            assert bad, f'「{needle}」没被拦下'
            assert needle in bad[0], f'报错里没写清命中词：{bad[0]}'
            assert ':1:' in bad[0], f'行号不对（应指向第 1 行）：{bad[0]}'
        case(f'拦截：{name}', run)

    expect_hit('论文名', '// W3 keyframe compression (SokoBench)\nconst a = 1;\n', 'SokoBench')
    expect_hit('脚本化世界模型名', '// restricted op DSL, WorldCoder style\nconst a = 1;\n', 'WorldCoder')
    expect_hit('预印本号', '// see arXiv:2601.20856 for the ladder\nconst a = 1;\n', 'arXiv')
    expect_hit('DOI 链接', '// https://doi.org/10.1109/TASLPRO.2025.3604650\nconst a = 1;\n', 'doi.org')
    expect_hit('会议缩写', '// NeurIPS 2024 world-model agent\nconst a = 1;\n', 'NeurIPS')
    expect_hit('引用习惯写法', '// Monti et al. report a degradation\nconst a = 1;\n', 'et al.')

    def mechanisms_pass():
        p = write('ok.mjs', '// 滑动窗口关键帧压缩 + 领域槽位解耦追踪 + 环境反馈自省环\n'
                            '// long-horizon keyframes, domain-slot disentangled tracking, scripted world model\n'
                            'export const a = 1;\n')
        bad, n = gate.check_citations([p])
        assert n == 1 and not bad, f'机制术语被误拦：{bad}'
    case('放行：机制术语（中英）', mechanisms_pass)

    def repo_clean():
        bad, n = gate.check_citations()
        assert not bad, f'仓库源码里有引用残留：{bad[:3]}'
        assert n > 100, f'扫描面太小（{n} 个文件）= glob 写坏了在静默空转'
        lines_bad, sizes = gate.check_line_count()
        assert not lines_bad, f'core 行数防线有违规：{lines_bad}'
        assert sizes, 'core 一个模块都没扫到'
    case('仓库现状：引用零命中 + 扫描面非空 + 行数防线仍在跑', repo_clean)

    tmp.cleanup()
    if failures:
        print(f'架构看门狗门控自测：{len(failures)} 项失败')
        return 1
    print('架构看门狗门控自测：全过（引用拦得住 / 机制术语放行 / 仓库现状干净）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
