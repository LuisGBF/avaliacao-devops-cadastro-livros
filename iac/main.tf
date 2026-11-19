# Infraestrutura como código com OpenTofu + libvirt/KVM
#
# Cria duas VMs Ubuntu 24.04 para a avaliação:
#   VM1 (web)  -> 192.168.122.10
#   VM2 (api)  -> 192.168.122.11
#
# Uso:
#   tofu init
#   tofu apply -var="ssh_public_key=$(cat ~/.ssh/id_ed25519.pub)"
#   tofu output

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    libvirt = {
      source  = "dmacvicar/libvirt"
      version = "~> 0.8.0"
    }
  }
}

provider "libvirt" {
  uri = var.libvirt_uri
}

# ---------------------------------------------------------------- variáveis

variable "libvirt_uri" {
  description = "URI de conexão com o libvirt."
  type        = string
  default     = "qemu:///system"
}

variable "pool" {
  description = "Pool de armazenamento do libvirt onde os discos serão criados."
  type        = string
  default     = "default"
}

variable "network_name" {
  description = "Rede libvirt (NAT) usada pelas VMs."
  type        = string
  default     = "default"
}

variable "image_url" {
  description = "Imagem cloud Ubuntu 24.04 (qcow2)."
  type        = string
  default     = "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
}

variable "ssh_public_key" {
  description = "Chave pública SSH que será injetada nas VMs via cloud-init."
  type        = string
}

variable "vm_user" {
  description = "Usuário criado pelo cloud-init."
  type        = string
  default     = "devops"
}

variable "vm_password_hash" {
  description = "Hash da senha do usuário (openssl passwd -6). Opcional."
  type        = string
  default     = ""
  sensitive   = true
}

variable "vms" {
  description = "Definição das duas VMs da avaliação."
  type = map(object({
    hostname = string
    ip       = string
    memory   = number
    vcpu     = number
    disk_gb  = number
  }))
  default = {
    web = {
      hostname = "vm1-web"
      ip       = "192.168.122.10"
      memory   = 2048
      vcpu     = 2
      disk_gb  = 15
    }
    api = {
      hostname = "vm2-api"
      ip       = "192.168.122.11"
      memory   = 3072
      vcpu     = 2
      disk_gb  = 20
    }
  }
}

# ---------------------------------------------------------------- imagem base

resource "libvirt_volume" "ubuntu_base" {
  name   = "ubuntu-24.04-base.qcow2"
  pool   = var.pool
  format = "qcow2"
  source = var.image_url
}

# ---------------------------------------------------------------- cloud-init

resource "libvirt_cloudinit_disk" "init" {
  for_each = var.vms

  name = "cloudinit-${each.key}.iso"
  pool = var.pool
  user_data = templatefile("${path.module}/cloud_init.yaml", {
    hostname         = each.value.hostname
    vm_user          = var.vm_user
    ssh_public_key   = var.ssh_public_key
    vm_password_hash = var.vm_password_hash
  })
  meta_data = yamlencode({
    instance-id    = "iid-${each.key}"
    local-hostname = each.value.hostname
  })
}

# ---------------------------------------------------------------- discos

resource "libvirt_volume" "vm_disk" {
  for_each = var.vms

  name           = "${each.value.hostname}.qcow2"
  pool           = var.pool
  format         = "qcow2"
  base_volume_id = libvirt_volume.ubuntu_base.id
  size           = each.value.disk_gb * 1024 * 1024 * 1024
}

# ---------------------------------------------------------------- VMs

resource "libvirt_domain" "vm" {
  for_each = var.vms

  name      = each.value.hostname
  memory    = each.value.memory
  vcpu      = each.value.vcpu
  cloudinit = libvirt_cloudinit_disk.init[each.key].id
  autostart = true

  cpu {
    mode = "host-model"
  }

  disk {
    volume_id = libvirt_volume.vm_disk[each.key].id
  }

  network_interface {
    network_name   = var.network_name
    wait_for_lease = true
  }

  console {
    type        = "pty"
    target_port = "0"
    target_type = "serial"
  }

  graphics {
    type        = "spice"
    listen_type = "address"
    autoport    = true
  }
}

# ---------------------------------------------------------------- saídas

output "vm_ips" {
  description = "IPs das VMs criadas."
  value = {
    for key, vm in libvirt_domain.vm : key => vm.network_interface[0].addresses[0]
  }
}

output "web_url" {
  description = "Endereço da aplicação web (VM1)."
  value       = "http://${libvirt_domain.vm["web"].network_interface[0].addresses[0]}"
}

output "api_url" {
  description = "Endereço da API REST (VM2)."
  value       = "http://${libvirt_domain.vm["api"].network_interface[0].addresses[0]}:3000"
}

output "ssh_commands" {
  description = "Comandos de acesso SSH."
  value = {
    for key, vm in libvirt_domain.vm : key => "ssh ${var.vm_user}@${vm.network_interface[0].addresses[0]}"
  }
}
